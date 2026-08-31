export type CodeFileSelection = {
  readonly path: string
  readonly startLine: number
  readonly endLine: number
}

export type GitHubServiceRevision = {
  readonly provider: "github"
  readonly owner: string
  readonly repository: string
  readonly revision: string
  readonly files: ReadonlyArray<CodeFileSelection>
}

export type ServiceCatalog = Readonly<Record<string, GitHubServiceRevision>>

export const makeServiceCatalog = (
  checkoutApiRevision: string
): ServiceCatalog => ({
  "checkout-api": {
    provider: "github",
    owner: "greffsh",
    repository: "observability-ai",
    revision: checkoutApiRevision,
    files: [
      { path: "services/checkout-api/src/app.ts", startLine: 38, endLine: 89 },
      { path: "services/checkout-api/src/metrics.ts", startLine: 7, endLine: 36 }
    ]
  }
})
