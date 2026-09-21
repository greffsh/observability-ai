# Incident diagnosis output contract v2

Write one UTF-8 Markdown document with at most 500 whitespace-delimited words.
Use exactly these headings, in this order:

```markdown
# Diagnóstico — <service> / <environment>

**Incident ID:** `<uuid>`
**Severidade recomendada:** `<informativa|baixa|media|alta|critica|inconclusiva>`
**Confiança:** `<0.0–1.0>`
**Status da causa:** `<hypothesis|insufficient_context>`

## Diagnóstico

Dois ou três parágrafos curtos com impacto, causa provável e grau de certeza.
Todas as evidências decisivas aparecem como IDs entre crases, por exemplo
`logs-1`. Referências de código usam `src/file.ts:42`.

## Evidências-chave

| ID | Fonte | O que sustenta | Referência |
|---|---|---|---|
| `logs-1` | logs | Log que sustenta a inferência. | http://referencia-exata |

## Limitações

- No máximo três itens. Preserve literalmente códigos declarados pelo handoff,
  como `logs:truncated`, e combine limitações relacionadas quando necessário.

## Próxima verificação

- De uma a três verificações concretas que confirmem ou refutem o diagnóstico.

## Checkout analisado

- **Branch:** `<branch|detached|not_available>`
- **Commit:** `<sha|not_available>`
- **Estado:** `<clean|dirty|not_a_git_repository>`
- **Correspondência com deployment:** `<exact|mismatch|multiple_revisions|unknown>`
- **Revisão de código analisada:** `<sha|not_available>`
- **Origem da revisão analisada:** `<deployment|checkout|not_available>`
```

## Evidence rules

- Select one to five decisive evidence items; do not reproduce the whole handoff.
- Every evidence ID cited in `Diagnóstico` must have exactly one table row, and
  every table row must be cited in `Diagnóstico`.
- Copy `Fonte` and `Referência` exactly from the matching handoff item. Write a
  short, incident-specific explanation in `O que sustenta`.
- Do not treat an alert firing, temporal proximity, matching text or span order
  as proof of cause by itself. Trace evidence may prove the observed service
  path and status while the causal attribution remains a hypothesis.
- Observed impact must come from selected evidence. Unknown impact must be
  stated explicitly and supported by the evidence that establishes the limit.

## Code and checkout rules

- Code citations must be repository-relative and point to a real one-based line
  number in `Revisão de código analisada`.
- When `Origem da revisão analisada` is `deployment`, inspect and validate files
  from that Git commit object without switching the checkout. Such a citation
  supports what the observed deployment revision implements.
- When the origin is `checkout`, a citation supports only what the supplied
  checkout implements and does not prove that revision was deployed.
- Every explicit implementation claim requires at least one code citation in
  `Diagnóstico`.
- When the checkout is a Git repository, branch, commit and dirty state must
  match its current read-only Git state.
- Derive deployment correspondence only from the v2 handoff's
  `deploymentContext` and the checkout HEAD:
  - `exact`: exactly one observed identifier resolves to the checkout HEAD;
  - `mismatch`: one authoritative revision or commit-like fallback differs;
  - `multiple_revisions`: more than one distinct revision was observed;
  - `unknown`: no revision was observed, or a non-commit `service.version`
    fallback cannot be resolved in the checkout.
- Branch and tag names are informational because refs are mutable. The immutable
  full revision is authoritative when `revisionSource` is
  `vcs.ref.head.revision`.
- If exactly one deployment identifier resolves in the local Git object database,
  `Revisão de código analisada` is that full commit and its origin is `deployment`,
  even when the checkout correspondence is `mismatch`.
- If no unique deployment revision can be read locally, analyze the checkout HEAD
  with origin `checkout` and preserve the mismatch, multiple-revision or unknown
  limitation.
- Dirty working-tree contents never affect citations whose origin is `deployment`;
  they remain relevant when the analysis origin is `checkout`.
