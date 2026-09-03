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

type LogEntry = {
  readonly timestamp: string
  readonly line: string
  readonly labels: {
    readonly service: string
    readonly environment: string
    readonly level: string | null
  }
}

const errorLevels = new Set(["alert", "crit", "critical", "emerg", "error", "fatal", "panic"])

const structuredLevel = (line: string): string | null => {
  try {
    const value = JSON.parse(line) as unknown
    if (typeof value !== "object" || value === null) return null
    const record = value as Readonly<Record<string, unknown>>
    const level = record.level ?? record.severity ?? record.severityText ?? record.severity_text
    return typeof level === "string" ? level : null
  } catch {
    return null
  }
}

const normalizedLevel = (entry: LogEntry): string | null => {
  const level = entry.labels.level ?? structuredLevel(entry.line)
  return level === null ? null : level.trim().toLowerCase()
}

const distanceFrom = (timestamp: string, reference: Date): bigint => {
  try {
    const timestampNs = BigInt(timestamp)
    const referenceNs = BigInt(reference.getTime()) * 1_000_000n
    return timestampNs >= referenceNs
      ? timestampNs - referenceNs
      : referenceNs - timestampNs
  } catch {
    return 2n ** 127n
  }
}

const selectLogEntries = (
  entries: ReadonlyArray<LogEntry>,
  incidentDetectedAt: Date,
  limit: number
): ReadonlyArray<LogEntry> => entries
  .map((entry, index) => ({
    entry,
    index,
    isError: errorLevels.has(normalizedLevel(entry) ?? ""),
    distance: distanceFrom(entry.timestamp, incidentDetectedAt)
  }))
  .sort((left, right) => {
    if (left.isError !== right.isError) return left.isError ? -1 : 1
    if (left.distance !== right.distance) return left.distance < right.distance ? -1 : 1
    return left.index - right.index
  })
  .slice(0, limit)
  .map(({ entry }) => entry)
  .sort((left, right) => left.timestamp.localeCompare(right.timestamp))

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
    requestUrl.searchParams.set("limit", String(context.policy.maxLogScanEntries))
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

    const rawEntries: ReadonlyArray<LogEntry> = (response.data.result ?? [])
      .flatMap((stream) => (stream.values ?? []).map(([timestamp, line]) => ({
        timestamp,
        line,
        labels: {
          service: stream.stream?.service ?? context.incident.service,
          environment: stream.stream?.environment ?? context.incident.environment,
          level: stream.stream?.level ??
            stream.stream?.severity_text ??
            stream.stream?.detected_level ??
            null
        }
      })))
    const entries = selectLogEntries(
      rawEntries,
      context.incident.detectedAt,
      context.policy.maxLogEntries
    )
    const reference = new URL("/loki/api/v1/query_range", options.publicBaseUrl)
    reference.search = requestUrl.search
    const evidence: EvidenceItem = {
      id: "logs-1",
      source: "logs",
      description: `Loki logs for ${context.incident.service} in ${context.incident.environment}`,
      reference: reference.toString(),
      interval: context.window,
      untrusted: true,
      data: {
        query,
        selection: {
          strategy: "errors_then_incident_proximity",
          scannedEntries: rawEntries.length,
          returnedEntries: entries.length
        },
        entries
      }
    }

    const limitations = rawEntries.length > context.policy.maxLogEntries ||
      rawEntries.length >= context.policy.maxLogScanEntries
      ? [{
          source: "logs" as const,
          code: "truncated" as const,
          description: `Selected ${entries.length} of ${rawEntries.length} scanned log entries; errors and incident proximity were prioritized`
        }]
      : []

    return { evidence: [evidence], limitations } satisfies SourceCollection
  })
})
