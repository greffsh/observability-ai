import type { EvidenceItem, EvidencePackage } from "../evidence/contracts.js"
import type { ImpactMetricSignal } from "../service-catalog.js"

type MetricSeries = {
  readonly samples?: ReadonlyArray<readonly [number, string]>
}

type MetricData = {
  readonly signal?: ImpactMetricSignal
  readonly stepSeconds?: number
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
  readonly limitations: ReadonlyArray<string>
}

const samplesOf = (series: MetricSeries): ReadonlyArray<readonly [number, number]> =>
  (series.samples ?? [])
    .map(([timestamp, value]) => [timestamp, Number(value)] as const)
    .filter(([, value]) => Number.isFinite(value))
    .sort(([left], [right]) => left - right)

type CounterIncrease = {
  readonly value: number | null
  readonly baselineMissing: boolean
}

const counterIncrease = (
  series: MetricSeries,
  baselineDeadlineSeconds: number
): CounterIncrease => {
  const samples = samplesOf(series)
  if (samples.length < 2) {
    return {
      value: null,
      baselineMissing: (samples[0]?.[1] ?? 0) > 0
    }
  }

  let increase = 0
  for (let index = 1; index < samples.length; index += 1) {
    const previous = samples[index - 1]?.[1]
    const current = samples[index]?.[1]
    if (previous === undefined || current === undefined) continue
    increase += current >= previous ? current - previous : current
  }
  if (
    increase === 0 &&
    (samples[0]?.[1] ?? 0) > 0 &&
    (samples[0]?.[0] ?? Number.POSITIVE_INFINITY) > baselineDeadlineSeconds
  ) {
    return { value: null, baselineMissing: true }
  }

  return { value: increase, baselineMissing: false }
}

const sumKnown = (values: ReadonlyArray<number | null>): number | null => {
  if (values.length === 0 || values.some((value) => value === null)) return null
  return values.reduce<number>((sum, value) => sum + (value ?? 0), 0)
}

const measureCounter = (
  series: ReadonlyArray<MetricSeries>,
  baselineDeadlineSeconds: number
) => {
  const measurements = series.map((item) => counterIncrease(item, baselineDeadlineSeconds))
  return {
    value: sumKnown(measurements.map((measurement) => measurement.value)),
    baselineMissing: measurements.some((measurement) => measurement.baselineMissing)
  }
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
): Readonly<Partial<Record<ImpactMetricSignal, {
  item: EvidenceItem
  stepSeconds: number
  series: ReadonlyArray<MetricSeries>
}>>> => {
  const result: Partial<Record<ImpactMetricSignal, {
    item: EvidenceItem
    stepSeconds: number
    series: ReadonlyArray<MetricSeries>
  }>> = {}

  for (const item of evidencePackage.evidence) {
    if (item.source !== "metrics" || typeof item.data !== "object" || item.data === null) continue
    const data = item.data as MetricData
    if (data.signal === undefined || !Array.isArray(data.series)) continue
    result[data.signal] = {
      item,
      stepSeconds: typeof data.stepSeconds === "number" ? data.stepSeconds : 0,
      series: data.series
    }
  }

  return result
}

export const measureImpact = (evidencePackage: EvidencePackage): ImpactMeasurement => {
  const evidence = metricEvidenceBySignal(evidencePackage)
  const windowStartSeconds = evidencePackage.window.start.getTime() / 1_000
  const totalRequests = measureCounter(
    evidence.totalRequests?.series ?? [],
    windowStartSeconds + (evidence.totalRequests?.stepSeconds ?? 0) * 2
  )
  const failedRequests = measureCounter(
    evidence.failedRequests?.series ?? [],
    windowStartSeconds + (evidence.failedRequests?.stepSeconds ?? 0) * 2
  )
  const errorRate = totalRequests.value !== null && failedRequests.value !== null && totalRequests.value > 0
    ? failedRequests.value / totalRequests.value
    : null
  const limitations = [
    totalRequests.baselineMissing ? "metrics:counter_baseline_missing:totalRequests" : null,
    failedRequests.baselineMissing ? "metrics:counter_baseline_missing:failedRequests" : null
  ].filter((limitation): limitation is string => limitation !== null)

  return {
    signals: {
      failedRequests: failedRequests.value,
      totalRequests: totalRequests.value,
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
    ),
    limitations
  }
}
