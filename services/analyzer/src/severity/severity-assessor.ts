import { Effect, Option } from "effect"
import type { EvidenceCollector } from "../evidence/contracts.js"
import type { EventStore } from "../persistence/event-store.js"
import type { ServiceCatalog } from "../service-catalog.js"
import { classifySeverity } from "./classify-severity.js"
import {
  SeverityIncidentNotFoundError,
  SeverityUnavailableError,
  type SeverityAssessor
} from "./contracts.js"

type SeverityAssessorOptions = {
  readonly eventStore: EventStore
  readonly evidenceCollector: EvidenceCollector
  readonly catalog: ServiceCatalog
}

export const makeSeverityAssessor = (
  options: SeverityAssessorOptions
): SeverityAssessor => ({
  assess: (incidentId) => Effect.gen(function* () {
    const incident = yield* options.eventStore.findIncidentById(incidentId).pipe(
      Effect.mapError((cause) => new SeverityUnavailableError({ cause }))
    )
    if (Option.isNone(incident)) {
      return yield* new SeverityIncidentNotFoundError({ incidentId })
    }

    const evidencePackage = yield* options.evidenceCollector.collect(incidentId).pipe(
      Effect.mapError((cause) => cause._tag === "IncidentEvidenceNotFoundError"
        ? new SeverityIncidentNotFoundError({ incidentId })
        : new SeverityUnavailableError({ cause }))
    )

    return {
      assessment: classifySeverity(incident.value, evidencePackage, options.catalog),
      evidencePackage
    }
  })
})
