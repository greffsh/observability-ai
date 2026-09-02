import { Effect } from "effect"
import type {
  EvidenceItem,
  EvidenceSource,
  SourceCollection
} from "./contracts.js"
import { EvidenceSourceError } from "./contracts.js"
import { fetchJson } from "./http.js"
import {
  findEnvironmentProfile,
  type ImpactMetricSignal,
  renderImpactQuery,
  type ServiceCatalog
} from "../service-catalog.js"

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

type PrometheusSourceOptions = {
  readonly baseUrl: string
  readonly publicBaseUrl: string
  readonly catalog: ServiceCatalog
}

const signalOrder: ReadonlyArray<ImpactMetricSignal> = [
  "totalRequests",
  "failedRequests",
  "failureState",
  "availability",
  "lastChange"
]

const allowedMetricLabels = new Set([
  "__name__",
  "service",
  "environment",
  "outcome",
  "http_status"
])

export const makePrometheusEvidenceSource = (
  options: PrometheusSourceOptions
): EvidenceSource => ({
  source: "metrics",
  collect: (context) => Effect.gen(function* () {
    const profile = findEnvironmentProfile(
      options.catalog,
      context.incident.service,
      context.incident.environment
    )
    const configuredQueries = profile?.environment.impactQueries

    if (configuredQueries === undefined) {
      return {
        evidence: [],
        limitations: [{
          source: "metrics",
          code: "not_configured",
          description: `No impact queries are configured for ${context.incident.service} in ${context.incident.environment}`
        }]
      } satisfies SourceCollection
    }

    const queries = signalOrder.flatMap((signal) => {
      const template = configuredQueries[signal]
      return template === undefined
        ? []
        : [{
            signal,
            query: renderImpactQuery(
              template,
              context.incident.service,
              context.incident.environment
            )
          }]
    })
    const durationSeconds = Math.max(
      1,
      (context.window.end.getTime() - context.window.start.getTime()) / 1_000
    )
    const step = Math.max(
      1,
      Math.ceil(durationSeconds / Math.max(1, context.policy.maxMetricPoints - 1))
    )
    const evidence: Array<EvidenceItem> = []
    const limitations: SourceCollection["limitations"][number][] = []

    for (let index = 0; index < queries.length; index += 1) {
      const configuredQuery = queries[index]
      if (configuredQuery === undefined) continue
      const { query, signal } = configuredQuery

      const requestUrl = new URL("/api/v1/query_range", options.baseUrl)
      requestUrl.searchParams.set("query", query)
      requestUrl.searchParams.set("start", context.window.start.toISOString())
      requestUrl.searchParams.set("end", context.window.end.toISOString())
      requestUrl.searchParams.set("step", String(step))
      requestUrl.searchParams.set("limit", String(context.policy.maxMetricSeries))
      const response = yield* fetchJson<PrometheusResponse>(requestUrl, {
        source: "metrics",
        timeoutMs: context.policy.sourceTimeoutMs
      })

      if (response.status !== "success" || response.data?.resultType !== "matrix") {
        return yield* new EvidenceSourceError({
          source: "metrics",
          reason: "Prometheus returned an unsupported response"
        })
      }

      const reference = new URL("/api/v1/query_range", options.publicBaseUrl)
      reference.search = requestUrl.search
      const rawSeries = response.data.result ?? []
      const series = rawSeries.slice(0, context.policy.maxMetricSeries).map((result) => ({
        labels: Object.fromEntries(
          Object.entries(result.metric ?? {}).filter(([name]) =>
            allowedMetricLabels.has(name)
          )
        ),
        samples: (result.values ?? []).slice(0, context.policy.maxMetricPoints)
      }))

      evidence.push({
        id: `metrics-${index + 1}`,
        source: "metrics",
        description: `Prometheus impact query for ${signal}`,
        reference: reference.toString(),
        interval: context.window,
        untrusted: true,
        data: { signal, query, stepSeconds: step, series }
      })

      if ((response.warnings?.length ?? 0) > 0 || (response.infos?.length ?? 0) > 0) {
        limitations.push({
          source: "metrics",
          code: "partial",
          description: `Prometheus returned ${response.warnings?.length ?? 0} warning(s) and ${response.infos?.length ?? 0} info message(s)`
        })
      }

      if (rawSeries.length > context.policy.maxMetricSeries || rawSeries.some(
        (result) => (result.values?.length ?? 0) > context.policy.maxMetricPoints
      )) {
        limitations.push({
          source: "metrics",
          code: "truncated",
          description: "Metric evidence exceeded the configured local limit"
        })
      }
    }

    return { evidence, limitations } satisfies SourceCollection
  })
})
