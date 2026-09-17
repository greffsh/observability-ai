import { Effect, Either } from "effect"
import type { EvidenceItem, EvidenceSource, SourceCollection } from "./contracts.js"
import { EvidenceSourceError } from "./contracts.js"
import { fetchJson } from "./http.js"

type OtlpValue = {
  readonly stringValue?: string
  readonly intValue?: string | number
  readonly doubleValue?: number
  readonly boolValue?: boolean
}

type OtlpAttribute = {
  readonly key?: string
  readonly value?: OtlpValue
}

type TempoSpan = {
  readonly spanId?: string
  readonly parentSpanId?: string
  readonly name?: string
  readonly kind?: string | number
  readonly startTimeUnixNano?: string
  readonly endTimeUnixNano?: string
  readonly attributes?: ReadonlyArray<OtlpAttribute>
  readonly status?: { readonly code?: string | number; readonly message?: string }
}

type TempoBatch = {
  readonly resource?: { readonly attributes?: ReadonlyArray<OtlpAttribute> }
  readonly scopeSpans?: ReadonlyArray<{
    readonly scope?: { readonly name?: string }
    readonly spans?: ReadonlyArray<TempoSpan>
  }>
}

type TempoTraceResponse = {
  readonly batches?: ReadonlyArray<TempoBatch>
  readonly resourceSpans?: ReadonlyArray<TempoBatch>
}

type TempoSearchTrace = {
  readonly traceID?: string
  readonly rootServiceName?: string
  readonly rootTraceName?: string
  readonly startTimeUnixNano?: string
  readonly durationMs?: number
}

type TempoSearchResponse = {
  readonly traces?: ReadonlyArray<TempoSearchTrace>
}

type TempoSourceOptions = {
  readonly baseUrl: string
  readonly publicBaseUrl: string
}

const allowedSpanAttributes = new Set([
  "http.request.method",
  "http.route",
  "http.response.status_code",
  "http.method",
  "http.status_code",
  "rpc.system",
  "rpc.service",
  "db.system",
  "server.address",
  "server.port",
  "network.protocol.name",
  "error.type"
])

const traceqlString = (value: string): string =>
  value.replaceAll("\\", "\\\\").replaceAll("\"", "\\\"").replaceAll("\n", "\\n")

const scalarValue = (value: OtlpValue | undefined): string | number | boolean | null => {
  if (value?.stringValue !== undefined) return value.stringValue
  if (value?.intValue !== undefined) return value.intValue
  if (value?.doubleValue !== undefined) return value.doubleValue
  if (value?.boolValue !== undefined) return value.boolValue
  return null
}

const attributesFrom = (
  attributes: ReadonlyArray<OtlpAttribute> | undefined,
  allowed?: ReadonlySet<string>
): Readonly<Record<string, string | number | boolean>> => Object.fromEntries(
  (attributes ?? []).flatMap((attribute) => {
    if (attribute.key === undefined || (allowed !== undefined && !allowed.has(attribute.key))) {
      return []
    }
    const value = scalarValue(attribute.value)
    return value === null ? [] : [[attribute.key, value] as const]
  })
)

const dateFromNanoseconds = (value: string | undefined): string | null => {
  if (value === undefined) return null
  try {
    return new Date(Number(BigInt(value) / 1_000_000n)).toISOString()
  } catch {
    return null
  }
}

const durationMs = (start: string | undefined, end: string | undefined): number | null => {
  if (start === undefined || end === undefined) return null
  try {
    const duration = Number(BigInt(end) - BigInt(start)) / 1_000_000
    return Number.isFinite(duration) && duration >= 0 ? duration : null
  } catch {
    return null
  }
}

const isErrorStatus = (code: string | number | undefined): boolean =>
  code === 2 || code === "2" || code === "STATUS_CODE_ERROR" || code === "ERROR"

const normalizeTrace = (
  traceId: string,
  response: TempoTraceResponse,
  maxSpans: number
) => {
  const batches = response.batches ?? response.resourceSpans ?? []
  const rawSpans = batches.flatMap((batch) => {
    const resources = attributesFrom(batch.resource?.attributes)
    const service = typeof resources["service.name"] === "string"
      ? resources["service.name"]
      : "unknown"
    return (batch.scopeSpans ?? []).flatMap((scope) =>
      (scope.spans ?? []).map((span) => ({ service, scope: scope.scope?.name ?? null, span }))
    )
  })
  const selectedSpans = rawSpans
    .sort((left, right) =>
      (left.span.startTimeUnixNano ?? "").localeCompare(right.span.startTimeUnixNano ?? "") ||
      (left.span.spanId ?? "").localeCompare(right.span.spanId ?? "")
    )
    .slice(0, maxSpans)

  return {
    traceId,
    hasError: rawSpans.some(({ span }) => isErrorStatus(span.status?.code)),
    scannedSpans: rawSpans.length,
    spans: selectedSpans.map(({ service, scope, span }) => ({
      service,
      scope,
      spanId: span.spanId ?? null,
      parentSpanId: span.parentSpanId || null,
      name: span.name ?? "unknown",
      kind: span.kind ?? null,
      startedAt: dateFromNanoseconds(span.startTimeUnixNano),
      durationMs: durationMs(span.startTimeUnixNano, span.endTimeUnixNano),
      status: {
        code: span.status?.code ?? null,
        message: span.status?.message ?? null
      },
      attributes: attributesFrom(span.attributes, allowedSpanAttributes)
    }))
  }
}

const distanceFromIncident = (trace: TempoSearchTrace, incidentTime: Date): bigint => {
  try {
    const start = BigInt(trace.startTimeUnixNano ?? "0")
    const incident = BigInt(incidentTime.getTime()) * 1_000_000n
    return start >= incident ? start - incident : incident - start
  } catch {
    return 2n ** 127n
  }
}

export const makeTempoEvidenceSource = (options: TempoSourceOptions): EvidenceSource => ({
  source: "traces",
  collect: (context) => Effect.gen(function* () {
    const query = `{ resource.service.name = "${traceqlString(context.incident.service)}" && kind = server }`
    const searchUrl = new URL("/api/search", options.baseUrl)
    searchUrl.searchParams.set("q", query)
    searchUrl.searchParams.set("start", String(Math.floor(context.window.start.getTime() / 1_000)))
    searchUrl.searchParams.set("end", String(Math.ceil(context.window.end.getTime() / 1_000)))
    searchUrl.searchParams.set("limit", String(context.policy.maxTraceScan))

    const search = yield* fetchJson<TempoSearchResponse>(searchUrl, {
      source: "traces",
      timeoutMs: context.policy.sourceTimeoutMs,
      maxBytes: context.policy.maxSourceBytes
    })
    const candidates = (search.traces ?? [])
      .filter((trace): trace is TempoSearchTrace & { readonly traceID: string } =>
        typeof trace.traceID === "string" && trace.traceID.length > 0
      )
      .sort((left, right) => {
        const leftDistance = distanceFromIncident(left, context.incident.detectedAt)
        const rightDistance = distanceFromIncident(right, context.incident.detectedAt)
        return leftDistance === rightDistance ? left.traceID.localeCompare(right.traceID)
          : leftDistance < rightDistance ? -1 : 1
      })
      .slice(0, context.policy.maxTraceScan)

    const fetched = yield* Effect.forEach(candidates, (candidate) => {
      const traceUrl = new URL(`/api/traces/${encodeURIComponent(candidate.traceID)}`, options.baseUrl)
      return fetchJson<TempoTraceResponse>(traceUrl, {
        source: "traces",
        timeoutMs: context.policy.sourceTimeoutMs,
        maxBytes: context.policy.maxSourceBytes
      }).pipe(
        Effect.map((response) => ({
          candidate,
          trace: normalizeTrace(candidate.traceID, response, context.policy.maxSpansPerTrace)
        })),
        Effect.either
      )
    }, { concurrency: 3 })

    const successful = fetched.flatMap((result) => Either.isRight(result) ? [result.right] : [])
      .sort((left, right) => {
        if (left.trace.hasError !== right.trace.hasError) return left.trace.hasError ? -1 : 1
        const leftDistance = distanceFromIncident(left.candidate, context.incident.detectedAt)
        const rightDistance = distanceFromIncident(right.candidate, context.incident.detectedAt)
        return leftDistance === rightDistance ? left.candidate.traceID.localeCompare(right.candidate.traceID)
          : leftDistance < rightDistance ? -1 : 1
      })
      .slice(0, context.policy.maxTraces)

    const evidence: ReadonlyArray<EvidenceItem> = successful.map(({ candidate, trace }, index) => {
      const reference = new URL(
        `/api/traces/${encodeURIComponent(candidate.traceID)}`,
        options.publicBaseUrl
      )
      return {
        id: `traces-${index + 1}`,
        source: "traces",
        description: `Tempo trace for ${context.incident.service} in ${context.incident.environment}`,
        reference: reference.toString(),
        interval: {
          start: dateFromNanoseconds(candidate.startTimeUnixNano) === null
            ? context.window.start
            : new Date(dateFromNanoseconds(candidate.startTimeUnixNano)!),
          end: dateFromNanoseconds(candidate.startTimeUnixNano) === null
            ? context.window.end
            : new Date(
                new Date(dateFromNanoseconds(candidate.startTimeUnixNano)!).getTime() +
                (candidate.durationMs ?? 0)
              )
        },
        untrusted: true,
        data: {
          query,
          rootServiceName: candidate.rootServiceName ?? null,
          rootTraceName: candidate.rootTraceName ?? null,
          ...trace
        }
      }
    })

    const failedFetches = fetched.filter(Either.isLeft).length
    const truncatedSpans = successful.some(({ trace }) =>
      trace.scannedSpans > context.policy.maxSpansPerTrace
    )
    const limitations: SourceCollection["limitations"][number][] = []
    if (failedFetches > 0) {
      limitations.push({
        source: "traces",
        code: "partial",
        description: `${failedFetches} trace(s) could not be fetched from Tempo`
      })
    }
    if (
      candidates.length > context.policy.maxTraces ||
      (search.traces?.length ?? 0) >= context.policy.maxTraceScan ||
      truncatedSpans
    ) {
      limitations.push({
        source: "traces",
        code: "truncated",
        description: `Selected ${evidence.length} of ${candidates.length} candidate trace(s) with at most ${context.policy.maxSpansPerTrace} spans each`
      })
    }

    return { evidence, limitations } satisfies SourceCollection
  }).pipe(
    Effect.mapError((error) => error instanceof EvidenceSourceError
      ? error
      : new EvidenceSourceError({ source: "traces", reason: "Tempo collection failed" }))
  )
})
