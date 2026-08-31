import type { ServiceCriticality, Severity } from "./contracts.js"

export type ServiceProfile = {
  readonly criticality: ServiceCriticality
  readonly environments: Readonly<Record<string, { readonly severityCeiling: Severity }>>
}

export type ServiceCriticalityCatalog = Readonly<Record<string, ServiceProfile>>

export const serviceCriticalityCatalog: ServiceCriticalityCatalog = {
  "checkout-api": {
    criticality: "high",
    environments: {
      local: { severityCeiling: "critica" }
    }
  }
}
