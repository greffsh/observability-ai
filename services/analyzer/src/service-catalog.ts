import { readFile } from "node:fs/promises"
import { Data, Effect, Schema } from "effect"

export const ImpactMetricSignalSchema = Schema.Literal(
  "totalRequests",
  "failedRequests",
  "failureState",
  "availability",
  "lastChange"
)

export type ImpactMetricSignal = typeof ImpactMetricSignalSchema.Type

const ImpactQueriesSchema = Schema.Struct({
  totalRequests: Schema.optional(Schema.String),
  failedRequests: Schema.optional(Schema.String),
  failureState: Schema.optional(Schema.String),
  availability: Schema.optional(Schema.String),
  lastChange: Schema.optional(Schema.String)
})

const EnvironmentProfileSchema = Schema.Struct({
  severityCeiling: Schema.Literal(
    "informativa",
    "baixa",
    "media",
    "alta",
    "critica",
    "inconclusiva"
  ),
  impactQueries: Schema.optional(ImpactQueriesSchema)
})

const ServiceProfileSchema = Schema.Struct({
  criticality: Schema.Literal("low", "medium", "high"),
  environments: Schema.Record({
    key: Schema.String,
    value: EnvironmentProfileSchema
  })
})

export const ServiceCatalogSchema = Schema.Struct({
  schemaVersion: Schema.Literal(1),
  services: Schema.Record({
    key: Schema.String,
    value: ServiceProfileSchema
  })
})

export type ImpactQueries = typeof ImpactQueriesSchema.Type
export type EnvironmentProfile = typeof EnvironmentProfileSchema.Type
export type ServiceProfile = typeof ServiceProfileSchema.Type
export type ServiceCatalog = typeof ServiceCatalogSchema.Type

export class InvalidServiceCatalogError extends Data.TaggedError(
  "InvalidServiceCatalogError"
)<{ readonly cause: unknown }> {}

export const decodeServiceCatalog = (
  input: unknown
): Effect.Effect<ServiceCatalog, InvalidServiceCatalogError> =>
  Schema.decodeUnknown(ServiceCatalogSchema)(input).pipe(
    Effect.mapError((cause) => new InvalidServiceCatalogError({ cause }))
  )

export const loadServiceCatalog = (
  path: string
): Effect.Effect<ServiceCatalog, InvalidServiceCatalogError> =>
  Effect.tryPromise({
    try: () => readFile(path, "utf8"),
    catch: (cause) => new InvalidServiceCatalogError({ cause })
  }).pipe(
    Effect.flatMap((content) => Effect.try({
      try: () => JSON.parse(content) as unknown,
      catch: (cause) => new InvalidServiceCatalogError({ cause })
    })),
    Effect.flatMap(decodeServiceCatalog)
  )

export const findEnvironmentProfile = (
  catalog: ServiceCatalog,
  service: string,
  environment: string
): { readonly service: ServiceProfile; readonly environment: EnvironmentProfile } | null => {
  const serviceProfile = catalog.services[service]
  const environmentProfile = serviceProfile?.environments[environment]

  return serviceProfile === undefined || environmentProfile === undefined
    ? null
    : { service: serviceProfile, environment: environmentProfile }
}

export const renderImpactQuery = (
  template: string,
  service: string,
  environment: string
): string => template
  .replaceAll("{{service}}", escapePromqlString(service))
  .replaceAll("{{environment}}", escapePromqlString(environment))

const escapePromqlString = (value: string): string =>
  value.replaceAll("\\", "\\\\").replaceAll("\"", "\\\"").replaceAll("\n", "\\n")
