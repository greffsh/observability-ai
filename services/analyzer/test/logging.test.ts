import { Effect } from "effect"
import { describe, expect, it, vi } from "vitest"
import { makeEffectLoggerLayer } from "../src/logging.ts"

const makeSink = () => ({
  trace: vi.fn(),
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  fatal: vi.fn()
})

describe("Effect to Pino logging adapter", () => {
  it("maps the level and preserves structured annotations", () => {
    const sink = makeSink()

    Effect.runSync(
      Effect.logWarning("Grafana webhook authentication failed").pipe(
        Effect.annotateLogs({
          event: "grafana_webhook_unauthorized",
          reqId: "req-1"
        }),
        Effect.provide(makeEffectLoggerLayer(sink))
      )
    )

    expect(sink.warn).toHaveBeenCalledOnce()
    expect(sink.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "grafana_webhook_unauthorized",
        reqId: "req-1",
        fiberId: expect.any(String)
      }),
      "Grafana webhook authentication failed"
    )
  })

  it("does not emit through another Pino level", () => {
    const sink = makeSink()

    Effect.runSync(
      Effect.logInfo("accepted").pipe(
        Effect.provide(makeEffectLoggerLayer(sink))
      )
    )

    expect(sink.info).toHaveBeenCalledOnce()
    expect(sink.warn).not.toHaveBeenCalled()
    expect(sink.error).not.toHaveBeenCalled()
  })
})
