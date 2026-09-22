import { Effect } from "effect"
import { EvidenceSourceError, type ExternalEvidenceSourceName } from "./contracts.js"

type RequestOptions = {
  readonly source: ExternalEvidenceSourceName
  readonly timeoutMs: number
  readonly maxBytes?: number
  readonly headers?: Readonly<Record<string, string>>
}

const readLimitedText = async (response: Response, maxBytes?: number): Promise<string> => {
  if (maxBytes === undefined) return response.text()

  const declaredLength = Number(response.headers.get("content-length"))
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new Error("Source response exceeded the configured byte limit")
  }
  if (response.body === null) return ""

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let receivedBytes = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    receivedBytes += value.byteLength
    if (receivedBytes > maxBytes) {
      await reader.cancel()
      throw new Error("Source response exceeded the configured byte limit")
    }
    chunks.push(value)
  }
  return Buffer.concat(chunks).toString("utf8")
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

    return JSON.parse(await readLimitedText(response, options.maxBytes)) as A
  },
  catch: (cause) => new EvidenceSourceError({
    source: options.source,
    reason: cause instanceof Error
      ? `Source request failed: ${cause.message}`
      : "Source request failed"
  })
})
