import type { Incident } from "../domain/incident.js"
import type { EvidencePackage } from "../evidence/contracts.js"
import { findEnvironmentProfile, type ServiceCatalog } from "../service-catalog.js"
import type { Severity, SeverityAssessment, SeverityRule } from "./contracts.js"
import { measureImpact } from "./impact-signals.js"

const severityRank: Readonly<Record<Exclude<Severity, "inconclusiva">, number>> = {
  informativa: 0,
  baixa: 1,
  media: 2,
  alta: 3,
  critica: 4
}

const capSeverity = (
  severity: Exclude<Severity, "inconclusiva">,
  ceiling: Severity
): Exclude<Severity, "inconclusiva"> => {
  if (ceiling === "inconclusiva") return severity
  return severityRank[severity] <= severityRank[ceiling] ? severity : ceiling
}

export const classifySeverity = (
  incident: Incident,
  evidencePackage: EvidencePackage,
  catalog: ServiceCatalog
): SeverityAssessment => {
  const profile = findEnvironmentProfile(catalog, incident.service, incident.environment)
  const measurement = measureImpact(evidencePackage)
  const {
    failedRequests,
    totalRequests,
    errorRate,
    sustainedFailureSeconds,
    minimumAvailability,
    lastChangeAt
  } = measurement.signals
  const changeAgeSeconds = lastChangeAt === null
    ? null
    : (incident.detectedAt.getTime() - lastChangeAt.getTime()) / 1_000
  const recentChange = changeAgeSeconds === null
    ? null
    : changeAgeSeconds >= 0 && changeAgeSeconds <= 10 * 60
  const rules: Array<SeverityRule> = []
  const observations: Array<string> = []
  const limitations: Array<string> = evidencePackage.limitations.map(
    (limitation) => `${limitation.source}:${limitation.code}`
  )

  if (recentChange === true) {
    observations.push("Uma mudança foi registrada até 10 minutos antes do incidente; isso é contexto, não prova de causa.")
  }

  if (profile === null) {
    limitations.push("Não há criticidade versionada para o serviço e ambiente do incidente.")
    rules.push({
      code: "INSUFFICIENT_SERVICE_METADATA",
      description: "Classificação inconclusiva por ausência de metadados de criticidade.",
      evidenceIds: []
    })
    return {
      schemaVersion: 1,
      incidentId: incident.id,
      assessedAt: evidencePackage.collectedAt,
      recommendedSeverity: "inconclusiva",
      serviceCriticality: null,
      signals: { failedRequests, totalRequests, errorRate, sustainedFailureSeconds, minimumAvailability, lastChangeAt, recentChange },
      triggeredRules: rules,
      observations,
      limitations
    }
  }

  let severity: Exclude<Severity, "inconclusiva"> | null = null
  if (minimumAvailability !== null && minimumAvailability <= 0) {
    severity = profile.service.criticality === "high" ? "critica" : "alta"
    rules.push({
      code: "SERVICE_UNAVAILABLE",
      description: "A métrica de disponibilidade comprovou indisponibilidade do serviço.",
      evidenceIds: measurement.evidenceIds.availability === undefined
        ? []
        : [measurement.evidenceIds.availability]
    })
  } else if (
    failedRequests !== null && failedRequests > 0 &&
    ((sustainedFailureSeconds ?? 0) >= 60 || (failedRequests >= 5 && (errorRate ?? 0) >= 0.5))
  ) {
    severity = "alta"
    rules.push({
      code: "SUSTAINED_HIGH_ERROR_RATE",
      description: "Falhas sustentadas ou predominantes afetaram as operações observadas.",
      evidenceIds: [
        measurement.evidenceIds.failedRequests,
        measurement.evidenceIds.failureState
      ].filter((id): id is string => id !== undefined)
    })
  } else if (failedRequests !== null && failedRequests > 1) {
    severity = "media"
    rules.push({
      code: "MULTIPLE_REQUEST_FAILURES",
      description: "Mais de uma operação falhou na janela analisada.",
      evidenceIds: measurement.evidenceIds.failedRequests === undefined
        ? []
        : [measurement.evidenceIds.failedRequests]
    })
  } else if (failedRequests === 1) {
    severity = "baixa"
    rules.push({
      code: "ISOLATED_REQUEST_FAILURE",
      description: "Uma única falha foi observada na janela analisada.",
      evidenceIds: measurement.evidenceIds.failedRequests === undefined
        ? []
        : [measurement.evidenceIds.failedRequests]
    })
  } else if (totalRequests !== null && totalRequests > 0 && minimumAvailability !== null) {
    severity = "informativa"
    rules.push({
      code: "NO_OBSERVED_IMPACT",
      description: "Houve tráfego sem falhas nem indisponibilidade observadas.",
      evidenceIds: [
        measurement.evidenceIds.totalRequests,
        measurement.evidenceIds.availability
      ].filter((id): id is string => id !== undefined)
    })
  }

  if (severity === null) {
    limitations.push("As métricas disponíveis não permitem medir impacto suficiente.")
    rules.push({
      code: "INSUFFICIENT_IMPACT_DATA",
      description: "Classificação inconclusiva por ausência de sinais mensuráveis de impacto.",
      evidenceIds: []
    })
  }

  return {
    schemaVersion: 1,
    incidentId: incident.id,
    assessedAt: evidencePackage.collectedAt,
    recommendedSeverity: severity === null
      ? "inconclusiva"
      : capSeverity(severity, profile.environment.severityCeiling),
    serviceCriticality: profile.service.criticality,
    signals: { failedRequests, totalRequests, errorRate, sustainedFailureSeconds, minimumAvailability, lastChangeAt, recentChange },
    triggeredRules: rules,
    observations,
    limitations
  }
}
