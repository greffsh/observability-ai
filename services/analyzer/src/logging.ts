import {
  Cause,
  Effect,
  FiberId,
  HashMap,
  List,
  Logger,
  type Layer
} from "effect"
import pino, { type Logger as PinoLogger } from "pino"

export type EffectRunner = <A, E>(effect: Effect.Effect<A, E>) => Promise<A>

type PinoSink = Pick<
  PinoLogger,
  "debug" | "error" | "fatal" | "info" | "trace" | "warn"
>

const messageToString = (message: unknown): string => {
  if (typeof message === "string") {
    return message
  }

  try {
    return JSON.stringify(message)
  } catch {
    return String(message)
  }
}

export const makeEffectPinoLogger = (sink: PinoSink): Logger.Logger<unknown, void> =>
  Logger.make((entry) => {
    const annotations = Object.fromEntries(HashMap.toEntries(entry.annotations))
    const spans = Object.fromEntries(
      List.toArray(entry.spans).map((span) => [
        span.label,
        entry.date.getTime() - span.startTime
      ])
    )
    const fields = {
      ...annotations,
      fiberId: FiberId.threadName(entry.fiberId),
      ...(Object.keys(spans).length === 0 ? {} : { spans }),
      ...(Cause.isEmpty(entry.cause) ? {} : {
        cause: Cause.pretty(entry.cause, { renderErrorCause: true })
      })
    }
    const message = Array.isArray(entry.message)
      ? entry.message.map(messageToString).join(" ")
      : messageToString(entry.message)

    switch (entry.logLevel._tag) {
      case "Trace":
        sink.trace(fields, message)
        break
      case "Debug":
        sink.debug(fields, message)
        break
      case "Info":
        sink.info(fields, message)
        break
      case "Warning":
        sink.warn(fields, message)
        break
      case "Error":
        sink.error(fields, message)
        break
      case "Fatal":
        sink.fatal(fields, message)
        break
      case "All":
        sink.trace(fields, message)
        break
      case "None":
        break
    }
  })

export const makeEffectLoggerLayer = (sink: PinoSink): Layer.Layer<never> =>
  Logger.replace(Logger.defaultLogger, makeEffectPinoLogger(sink))

type ApplicationLogging = {
  readonly logger: PinoLogger
  readonly layer: Layer.Layer<never>
  readonly runPromise: EffectRunner
  readonly flush: () => Promise<void>
}

export const makeApplicationLogging = (options: {
  readonly environment: string
  readonly service: string
}): ApplicationLogging => {
  const destination = pino.destination({
    dest: 1,
    sync: false
  })
  const logger = pino({
    level: "info",
    base: {
      service: options.service,
      environment: options.environment
    },
    formatters: {
      level: (label) => ({ level: label })
    },
    timestamp: pino.stdTimeFunctions.isoTime
  }, destination)
  const layer = makeEffectLoggerLayer(logger)

  return {
    logger,
    layer,
    runPromise: (effect) => Effect.runPromise(effect.pipe(Effect.provide(layer))),
    flush: () => new Promise<void>((resolve, reject) => {
      logger.flush((error) => {
        if (error !== undefined) {
          reject(error)
          return
        }

        resolve()
      })
    })
  }
}
