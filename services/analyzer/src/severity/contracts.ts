export type Severity =
  | "informativa"
  | "baixa"
  | "media"
  | "alta"
  | "critica"
  | "inconclusiva"

export type ServiceCriticality = "low" | "medium" | "high"

export type SeverityRule = {
  readonly code: string
  readonly description: string
  readonly evidenceIds: ReadonlyArray<string>
}

export type SeverityAssessment = {
  readonly schemaVersion: 1
  readonly incidentId: string
  readonly assessedAt: Date
  readonly recommendedSeverity: Severity
  readonly serviceCriticality: ServiceCriticality | null
  readonly signals: {
    readonly failedRequests: number | null
    readonly totalRequests: number | null
    readonly errorRate: number | null
    readonly sustainedFailureSeconds: number | null
    readonly minimumAvailability: number | null
    readonly lastChangeAt: Date | null
    readonly recentChange: boolean | null
  }
  readonly triggeredRules: ReadonlyArray<SeverityRule>
  readonly observations: ReadonlyArray<string>
  readonly limitations: ReadonlyArray<string>
}
