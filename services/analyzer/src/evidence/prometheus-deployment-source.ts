import { Effect } from "effect"
import type { EvidenceSource, SourceCollection } from "./contracts.js"
import { EvidenceSourceError } from "./contracts.js"
import { fetchJson } from "./http.js"

type PrometheusMatrixResult = {
  readonly metric?: Readonly<Record<string, string>>
  readonly values?: ReadonlyArray<readonly [number, string]>
}

type PrometheusResponse = {
  readonly status?: string
  readonly warnings?: ReadonlyArray<string>
  readonly infos?: ReadonlyArray<string>
  readonly data?: {
    readonly resultType?: string
    readonly result?: ReadonlyArray<PrometheusMatrixResult>
  }
}

type PrometheusDeploymentSourceOptions = {
  readonly baseUrl: string
  readonly publicBaseUrl: string
}

type DeploymentRevision = {
  revision: string
  revisionSource: "vcs.ref.head.revision" | "service.version"
  serviceVersion: string | null
  repositoryUrl: string | null
  ref: {
    name: string | null
    type: "branch" | "tag" | null
  }
  firstObservedAt: string
  lastObservedAt: string
}

const promQlString = (value: string): string =>
  value.replaceAll("\\", "\\\\").replaceAll("\"", "\\\"").replaceAll("\n", "\\n")

const optionalLabel = (
  labels: Readonly<Record<string, string>>,
  name: string
): string | null => {
  const value = labels[name]?.trim()
  return value === undefined || value.length === 0 ? null : value
}

const observedAt = (seconds: number): string | null => {
  const date = new Date(seconds * 1_000)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

const normalizeRefType = (value: string | null): "branch" | "tag" | null =>
  value === "branch" || value === "tag" ? value : null

const normalizeRevisions = (
  series: ReadonlyArray<PrometheusMatrixResult>,
  maxPoints: number
): ReadonlyArray<DeploymentRevision> => {
  const revisions = new Map<string, DeploymentRevision>()

  for (const result of series) {
    const labels = result.metric ?? {}
    const vcsRevision = optionalLabel(labels, "vcs_ref_head_revision")
    const serviceVersion = optionalLabel(labels, "service_version")
    const revision = vcsRevision ?? serviceVersion
    if (revision === null) continue

    const timestamps = (result.values ?? [])
      .slice(0, maxPoints)
      .flatMap(([seconds]) => {
        const value = observedAt(seconds)
        return value === null ? [] : [value]
      })
      .sort()
    const firstObservedAt = timestamps.at(0)
    const lastObservedAt = timestamps.at(-1)
    if (firstObservedAt === undefined || lastObservedAt === undefined) continue

    const existing = revisions.get(revision)
    if (existing !== undefined) {
      existing.firstObservedAt = firstObservedAt < existing.firstObservedAt
        ? firstObservedAt
        : existing.firstObservedAt
      existing.lastObservedAt = lastObservedAt > existing.lastObservedAt
        ? lastObservedAt
        : existing.lastObservedAt
      continue
    }

    revisions.set(revision, {
      revision,
      revisionSource: vcsRevision === null ? "service.version" : "vcs.ref.head.revision",
      serviceVersion,
      repositoryUrl: optionalLabel(labels, "vcs_repository_url_full"),
      ref: {
        name: optionalLabel(labels, "vcs_ref_head_name"),
        type: normalizeRefType(optionalLabel(labels, "vcs_ref_head_type"))
      },
      firstObservedAt,
      lastObservedAt
    })
  }

  return [...revisions.values()].sort((left, right) =>
    left.firstObservedAt.localeCompare(right.firstObservedAt) ||
    left.revision.localeCompare(right.revision)
  )
}

export const makePrometheusDeploymentEvidenceSource = (
  options: PrometheusDeploymentSourceOptions
): EvidenceSource => ({
  source: "deployment",
  collect: (context) => Effect.gen(function* () {
    const query = `target_info{job="${promQlString(context.incident.service)}",deployment_environment_name="${promQlString(context.incident.environment)}"}`
    const durationSeconds = Math.max(
      1,
      (context.window.end.getTime() - context.window.start.getTime()) / 1_000
    )
    const step = Math.max(
      1,
      Math.ceil(durationSeconds / Math.max(1, context.policy.maxMetricPoints - 1))
    )
    const requestUrl = new URL("/api/v1/query_range", options.baseUrl)
    requestUrl.searchParams.set("query", query)
    requestUrl.searchParams.set("start", context.window.start.toISOString())
    requestUrl.searchParams.set("end", context.window.end.toISOString())
    requestUrl.searchParams.set("step", String(step))
    requestUrl.searchParams.set("limit", String(context.policy.maxMetricSeries))

    const response = yield* fetchJson<PrometheusResponse>(requestUrl, {
      source: "deployment",
      timeoutMs: context.policy.sourceTimeoutMs,
      maxBytes: context.policy.maxSourceBytes
    })
    if (response.status !== "success" || response.data?.resultType !== "matrix") {
      return yield* new EvidenceSourceError({
        source: "deployment",
        reason: "Prometheus returned an unsupported response"
      })
    }

    const reference = new URL("/api/v1/query_range", options.publicBaseUrl)
    reference.search = requestUrl.search
    const rawSeries = response.data.result ?? []
    const selectedSeries = rawSeries.slice(0, context.policy.maxMetricSeries)
    const revisions = normalizeRevisions(selectedSeries, context.policy.maxMetricPoints)
    const limitations: SourceCollection["limitations"][number][] = []

    if ((response.warnings?.length ?? 0) > 0 || (response.infos?.length ?? 0) > 0) {
      limitations.push({
        source: "deployment",
        code: "partial",
        description: `Prometheus returned ${response.warnings?.length ?? 0} warning(s) and ${response.infos?.length ?? 0} info message(s)`
      })
    }
    if (rawSeries.length > context.policy.maxMetricSeries || rawSeries.some(
      (result) => (result.values?.length ?? 0) > context.policy.maxMetricPoints
    )) {
      limitations.push({
        source: "deployment",
        code: "truncated",
        description: "Deployment evidence exceeded the configured local limit"
      })
    }

    return {
      evidence: [{
        id: "deployment-1",
        source: "deployment",
        description: revisions.length === 0
          ? "No deployment revision was observed in Prometheus target metadata"
          : `${revisions.length} deployment revision(s) observed in Prometheus target metadata`,
        reference: reference.toString(),
        interval: context.window,
        untrusted: true,
        data: { query, revisions }
      }],
      limitations
    } satisfies SourceCollection
  })
})
