import { Effect } from "effect"
import { EvidenceSourceError, type ExternalEvidenceSourceName } from "./contracts.js"

type RequestOptions = {
  readonly source: ExternalEvidenceSourceName
  readonly timeoutMs: number
  readonly headers?: Readonly<Record<string, string>>
}

export const fetchJson = <A>(
  url: URL,
  options: RequestOptions
): Effect.Effect<A, EvidenceSourceError> => Effect.tryPromise({
  try: async () => {
    const response = await fetch(url, {
      ...(options.headers === undefined ? {} : { headers: options.headers }),
      signal: AbortSignal.timeout(options.timeoutMs)
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    return await response.json() as A
  },
  catch: (cause) => new EvidenceSourceError({
    source: options.source,
    reason: cause instanceof Error
      ? `Source request failed: ${cause.message}`
      : "Source request failed"
  })
})

export const fetchText = (
  url: URL,
  options: RequestOptions
): Effect.Effect<string, EvidenceSourceError> => Effect.tryPromise({
  try: async () => {
    const response = await fetch(url, {
      ...(options.headers === undefined ? {} : { headers: options.headers }),
      signal: AbortSignal.timeout(options.timeoutMs)
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    return await response.text()
  },
  catch: (cause) => new EvidenceSourceError({
    source: options.source,
    reason: cause instanceof Error
      ? `Source request failed: ${cause.message}`
      : "Source request failed"
  })
})
