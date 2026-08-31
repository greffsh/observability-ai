import { createHash } from "node:crypto"
import { Effect } from "effect"
import type { EvidenceItem, EvidenceSource, SourceCollection } from "./contracts.js"
import { EvidenceSourceError } from "./contracts.js"
import { fetchText } from "./http.js"
import type { ServiceCatalog } from "./service-catalog.js"

type GitHubCodeSourceOptions = {
  readonly catalog: ServiceCatalog
  readonly token?: string
  readonly apiBaseUrl?: string
  readonly webBaseUrl?: string
}

const encodePath = (path: string): string =>
  path.split("/").map(encodeURIComponent).join("/")

export const makeGitHubCodeEvidenceSource = (
  options: GitHubCodeSourceOptions
): EvidenceSource => ({
  source: "codebase",
  collect: (context) => Effect.gen(function* () {
    const mapping = options.catalog[context.incident.service]

    if (mapping === undefined) {
      return {
        evidence: [],
        limitations: [{
          source: "codebase",
          code: "not_configured",
          description: `No deployed revision mapping exists for ${context.incident.service}`
        }]
      } satisfies SourceCollection
    }

    if (!/^[a-f0-9]{40}$/i.test(mapping.revision)) {
      return yield* new EvidenceSourceError({
        source: "codebase",
        reason: "Deployed revision mapping must use a full commit SHA"
      })
    }

    const selectedFiles = mapping.files.slice(0, context.policy.maxCodeFiles)
    const evidence: Array<EvidenceItem> = []

    for (let index = 0; index < selectedFiles.length; index += 1) {
      const selection = selectedFiles[index]
      if (selection === undefined) continue

      const endLine = Math.min(
        selection.endLine,
        selection.startLine + context.policy.maxCodeLinesPerFile - 1
      )
      const requestUrl = new URL(
        `/repos/${encodeURIComponent(mapping.owner)}/${encodeURIComponent(mapping.repository)}/contents/${encodePath(selection.path)}`,
        options.apiBaseUrl ?? "https://api.github.com"
      )
      requestUrl.searchParams.set("ref", mapping.revision)
      const headers: Record<string, string> = {
        accept: "application/vnd.github.raw+json",
        "x-github-api-version": "2022-11-28",
        "user-agent": "grafana-ai-analyzer"
      }
      if (options.token !== undefined && options.token.length > 0) {
        headers.authorization = `Bearer ${options.token}`
      }
      const file = yield* fetchText(requestUrl, {
        source: "codebase",
        timeoutMs: context.policy.sourceTimeoutMs,
        headers
      })
      const lines = file.split(/\r?\n/)
      const content = lines
        .slice(selection.startLine - 1, endLine)
        .map((line, lineIndex) => `${selection.startLine + lineIndex}: ${line}`)
        .join("\n")
      const webUrl = new URL(
        `/${encodeURIComponent(mapping.owner)}/${encodeURIComponent(mapping.repository)}/blob/${encodeURIComponent(mapping.revision)}/${encodePath(selection.path)}`,
        options.webBaseUrl ?? "https://github.com"
      )
      webUrl.hash = `L${selection.startLine}-L${endLine}`

      evidence.push({
        id: `codebase-${index + 1}`,
        source: "codebase",
        description: `${selection.path} at deployed revision ${mapping.revision}`,
        reference: webUrl.toString(),
        interval: null,
        untrusted: true,
        data: {
          provider: mapping.provider,
          repository: `${mapping.owner}/${mapping.repository}`,
          revision: mapping.revision,
          file: selection.path,
          startLine: selection.startLine,
          endLine,
          contentSha256: createHash("sha256").update(content).digest("hex"),
          content
        }
      })
    }

    const limitations = mapping.files.length > selectedFiles.length
      ? [{
          source: "codebase" as const,
          code: "truncated" as const,
          description: `Code evidence was limited to ${context.policy.maxCodeFiles} files`
        }]
      : []

    return { evidence, limitations } satisfies SourceCollection
  })
})
