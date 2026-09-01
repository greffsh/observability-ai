import type { Incident } from "../domain/incident.js"
import type { EvidenceItem, EvidencePackage } from "../evidence/contracts.js"
import type { ServiceCriticalityCatalog } from "./service-criticality.js"
import type { Severity, SeverityAssessment, SeverityRule } from "./contracts.js"

type MetricSeries = {
  readonly labels?: Readonly<Record<string, string>>
  readonly samples?: ReadonlyArray<readonly [number, string]>
}

type MetricData = {
  readonly query?: string
  readonly series?: ReadonlyArray<MetricSeries>
}

const severityRank: Readonly<Record<Exclude<Severity, "inconclusiva">, number>> = {
  informativa: 0,
  baixa: 1,
  media: 2,
  alta: 3,
  critica: 4
}

const metricEvidence = (
  evidencePackage: EvidencePackage,
  metricName: string
): { item: EvidenceItem; series: ReadonlyArray<MetricSeries> } | null => {
  for (const item of evidencePackage.evidence) {
    if (item.source !== "metrics" || typeof item.data !== "object" || item.data === null) continue
    const data = item.data as MetricData
    if (data.query?.split("{")[0] === metricName && Array.isArray(data.series)) {
      return { item, series: data.series }
    }
  }
  return null
}

const samplesOf = (series: MetricSeries): ReadonlyArray<readonly [number, number]> =>
  (series.samples ?? [])
    .map(([timestamp, value]) => [timestamp, Number(value)] as const)
    .filter(([, value]) => Number.isFinite(value))
    .sort(([left], [right]) => left - right)

const counterIncrease = (series: MetricSeries): number | null => {
  const samples = samplesOf(series)
  if (samples.length < 2) return null

  let increase = 0
  for (let index = 1; index < samples.length; index += 1) {
    const previous = samples[index - 1]?.[1]
    const current = samples[index]?.[1]
    if (previous === undefined || current === undefined) continue
    increase += current >= previous ? current - previous : current
  }
  return increase
}

const sumKnown = (values: ReadonlyArray<number | null>): number | null => {
  const known = values.filter((value): value is number => value !== null)
  return known.length === 0 ? null : known.reduce((sum, value) => sum + value, 0)
}

const minimumSample = (series: ReadonlyArray<MetricSeries>): number | null => {
  const values = series.flatMap((item) => samplesOf(item).map((sample) => sample[1]))
  return values.length === 0 ? null : Math.min(...values)
}

const maximumActiveDuration = (series: ReadonlyArray<MetricSeries>): number | null => {
  let found = false
  let maximum = 0
  for (const item of series) {
    let activeStart: number | null = null
    for (const [timestamp, value] of samplesOf(item)) {
      if (value >= 1) {
        found = true
        activeStart ??= timestamp
        maximum = Math.max(maximum, timestamp - activeStart)
      } else {
        activeStart = null
      }
    }
  }
  return found ? maximum : null
}

const latestChange = (series: ReadonlyArray<MetricSeries>): Date | null => {
  const values = series.flatMap((item) =>
    samplesOf(item).map((sample) => sample[1]).filter((value) => value > 0)
  )
  return values.length === 0 ? null : new Date(Math.max(...values) * 1_000)
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
  catalog: ServiceCriticalityCatalog
): SeverityAssessment => {
  const profile = catalog[incident.service]
  const environmentPolicy = profile?.environments[incident.environment]
  const requests = metricEvidence(evidencePackage, "checkout_requests_total")
  const failureMode = metricEvidence(evidencePackage, "checkout_failure_mode")
  const availability = metricEvidence(evidencePackage, "checkout_availability")
  const change = metricEvidence(evidencePackage, "checkout_last_change_timestamp_seconds")

  const allRequestIncreases = requests?.series.map(counterIncrease) ?? []
  const failedRequestIncreases = requests?.series
    .filter((series) => series.labels?.outcome === "failure")
    .map(counterIncrease) ?? []
  const totalRequests = sumKnown(allRequestIncreases)
  const failedRequests = sumKnown(failedRequestIncreases)
  const errorRate = totalRequests !== null && failedRequests !== null && totalRequests > 0
    ? failedRequests / totalRequests
    : null
  const sustainedFailureSeconds = failureMode === null
    ? null
    : maximumActiveDuration(failureMode.series)
  const minimumAvailability = availability === null
    ? null
    : minimumSample(availability.series)
  const lastChangeAt = change === null ? null : latestChange(change.series)
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

  if (recentChange === true && change !== null) {
    observations.push("Uma mudança foi registrada até 10 minutos antes do incidente; isso é contexto, não prova de causa.")
  }

  if (profile === undefined || environmentPolicy === undefined) {
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
      serviceCriticality: profile?.criticality ?? null,
      signals: { failedRequests, totalRequests, errorRate, sustainedFailureSeconds, minimumAvailability, lastChangeAt, recentChange },
      triggeredRules: rules,
      observations,
      limitations
    }
  }

  let severity: Exclude<Severity, "inconclusiva"> | null = null
  if (minimumAvailability !== null && minimumAvailability <= 0) {
    severity = profile.criticality === "high" ? "critica" : "alta"
    rules.push({
      code: "SERVICE_UNAVAILABLE",
      description: "A métrica de disponibilidade comprovou indisponibilidade do serviço.",
      evidenceIds: availability === null ? [] : [availability.item.id]
    })
  } else if (
    failedRequests !== null && failedRequests > 0 &&
    ((sustainedFailureSeconds ?? 0) >= 60 || (failedRequests >= 5 && (errorRate ?? 0) >= 0.5))
  ) {
    severity = "alta"
    rules.push({
      code: "SUSTAINED_HIGH_ERROR_RATE",
      description: "Falhas sustentadas ou predominantes afetaram operações de checkout.",
      evidenceIds: [requests?.item.id, failureMode?.item.id].filter((id): id is string => id !== undefined)
    })
  } else if (failedRequests !== null && failedRequests > 1) {
    severity = "media"
    rules.push({
      code: "MULTIPLE_CHECKOUT_FAILURES",
      description: "Mais de uma operação de checkout falhou na janela analisada.",
      evidenceIds: requests === null ? [] : [requests.item.id]
    })
  } else if (failedRequests === 1) {
    severity = "baixa"
    rules.push({
      code: "ISOLATED_CHECKOUT_FAILURE",
      description: "Uma única falha de checkout foi observada na janela analisada.",
      evidenceIds: requests === null ? [] : [requests.item.id]
    })
  } else if (totalRequests !== null && totalRequests > 0 && minimumAvailability !== null) {
    severity = "informativa"
    rules.push({
      code: "NO_OBSERVED_IMPACT",
      description: "Houve tráfego sem falhas nem indisponibilidade observadas.",
      evidenceIds: [requests?.item.id, availability?.item.id].filter((id): id is string => id !== undefined)
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
      : capSeverity(severity, environmentPolicy.severityCeiling),
    serviceCriticality: profile.criticality,
    signals: { failedRequests, totalRequests, errorRate, sustainedFailureSeconds, minimumAvailability, lastChangeAt, recentChange },
    triggeredRules: rules,
    observations,
    limitations
  }
}
