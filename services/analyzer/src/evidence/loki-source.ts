import { Effect } from "effect"
import type { EvidenceItem, EvidenceSource, SourceCollection } from "./contracts.js"
import { EvidenceSourceError } from "./contracts.js"
import { fetchJson } from "./http.js"

type LokiStream = {
  readonly stream?: Readonly<Record<string, string>>
  readonly values?: ReadonlyArray<readonly [string, string]>
}

type LokiResponse = {
  readonly status?: string
  readonly data?: {
    readonly resultType?: string
    readonly result?: ReadonlyArray<LokiStream>
  }
}

type LokiSourceOptions = {
  readonly baseUrl: string
  readonly publicBaseUrl: string
}

const logqlString = (value: string): string =>
  value.replaceAll("\\", "\\\\").replaceAll("\"", "\\\"").replaceAll("\n", "\\n")

const toNanoseconds = (date: Date): string =>
  (BigInt(date.getTime()) * 1_000_000n).toString()

export const makeLokiEvidenceSource = (
  options: LokiSourceOptions
): EvidenceSource => ({
  source: "logs",
  collect: (context) => Effect.gen(function* () {
    const query = `{service="${logqlString(context.incident.service)}",environment="${logqlString(context.incident.environment)}"} | json`
    const requestUrl = new URL("/loki/api/v1/query_range", options.baseUrl)
    requestUrl.searchParams.set("query", query)
    requestUrl.searchParams.set("start", toNanoseconds(context.window.start))
    requestUrl.searchParams.set(
      "end",
      toNanoseconds(new Date(context.window.end.getTime() + 1))
    )
    requestUrl.searchParams.set("direction", "backward")
    requestUrl.searchParams.set("limit", String(context.policy.maxLogEntries))
    const response = yield* fetchJson<LokiResponse>(requestUrl, {
      source: "logs",
      timeoutMs: context.policy.sourceTimeoutMs
    })

    if (response.status !== "success" || response.data?.resultType !== "streams") {
      return yield* new EvidenceSourceError({
        source: "logs",
        reason: "Loki returned an unsupported response"
      })
    }

    const rawEntries = (response.data.result ?? [])
      .flatMap((stream) => (stream.values ?? []).map(([timestamp, line]) => ({
        timestamp,
        line,
        labels: {
          service: stream.stream?.service ?? context.incident.service,
          environment: stream.stream?.environment ?? context.incident.environment,
          level: stream.stream?.level ?? null
        }
      })))
    const entries = rawEntries
      .sort((left, right) => left.timestamp.localeCompare(right.timestamp))
      .slice(0, context.policy.maxLogEntries)
    const reference = new URL("/loki/api/v1/query_range", options.publicBaseUrl)
    reference.search = requestUrl.search
    const evidence: EvidenceItem = {
      id: "logs-1",
      source: "logs",
      description: `Loki logs for ${context.incident.service} in ${context.incident.environment}`,
      reference: reference.toString(),
      interval: context.window,
      untrusted: true,
      data: { query, entries }
    }

    const limitations = rawEntries.length >= context.policy.maxLogEntries
      ? [{
          source: "logs" as const,
          code: "truncated" as const,
          description: `Log evidence reached the limit of ${context.policy.maxLogEntries} entries`
        }]
      : []

    return { evidence: [evidence], limitations } satisfies SourceCollection
  })
})
