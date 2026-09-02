import type { EvidenceItem, EvidencePackage } from "../evidence/contracts.js"
import type { ImpactMetricSignal } from "../service-catalog.js"

type MetricSeries = {
  readonly samples?: ReadonlyArray<readonly [number, string]>
}

type MetricData = {
  readonly signal?: ImpactMetricSignal
  readonly series?: ReadonlyArray<MetricSeries>
}

export type ImpactSignals = {
  readonly failedRequests: number | null
  readonly totalRequests: number | null
  readonly errorRate: number | null
  readonly sustainedFailureSeconds: number | null
  readonly minimumAvailability: number | null
  readonly lastChangeAt: Date | null
}

export type ImpactMeasurement = {
  readonly signals: ImpactSignals
  readonly evidenceIds: Readonly<Partial<Record<ImpactMetricSignal, string>>>
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

const latestPositiveSample = (series: ReadonlyArray<MetricSeries>): Date | null => {
  const values = series.flatMap((item) =>
    samplesOf(item).map((sample) => sample[1]).filter((value) => value > 0)
  )
  return values.length === 0 ? null : new Date(Math.max(...values) * 1_000)
}

const metricEvidenceBySignal = (
  evidencePackage: EvidencePackage
): Readonly<Partial<Record<ImpactMetricSignal, { item: EvidenceItem; series: ReadonlyArray<MetricSeries> }>>> => {
  const result: Partial<Record<ImpactMetricSignal, {
    item: EvidenceItem
    series: ReadonlyArray<MetricSeries>
  }>> = {}

  for (const item of evidencePackage.evidence) {
    if (item.source !== "metrics" || typeof item.data !== "object" || item.data === null) continue
    const data = item.data as MetricData
    if (data.signal === undefined || !Array.isArray(data.series)) continue
    result[data.signal] = { item, series: data.series }
  }

  return result
}

export const measureImpact = (evidencePackage: EvidencePackage): ImpactMeasurement => {
  const evidence = metricEvidenceBySignal(evidencePackage)
  const totalRequests = sumKnown(evidence.totalRequests?.series.map(counterIncrease) ?? [])
  const failedRequests = sumKnown(evidence.failedRequests?.series.map(counterIncrease) ?? [])
  const errorRate = totalRequests !== null && failedRequests !== null && totalRequests > 0
    ? failedRequests / totalRequests
    : null

  return {
    signals: {
      failedRequests,
      totalRequests,
      errorRate,
      sustainedFailureSeconds: evidence.failureState === undefined
        ? null
        : maximumActiveDuration(evidence.failureState.series),
      minimumAvailability: evidence.availability === undefined
        ? null
        : minimumSample(evidence.availability.series),
      lastChangeAt: evidence.lastChange === undefined
        ? null
        : latestPositiveSample(evidence.lastChange.series)
    },
    evidenceIds: Object.fromEntries(
      Object.entries(evidence).map(([signal, value]) => [signal, value.item.id])
    )
  }
}
