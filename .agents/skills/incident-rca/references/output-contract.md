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
- **Correspondência com deployment:** `unknown`
```

## Evidence rules

- Select one to five decisive evidence items; do not reproduce the whole handoff.
- Every evidence ID cited in `Diagnóstico` must have exactly one table row, and
  every table row must be cited in `Diagnóstico`.
- Copy `Fonte` and `Referência` exactly from the matching handoff item. Write a
  short, incident-specific explanation in `O que sustenta`.
- Do not treat an alert firing, temporal proximity or matching text as proof of
  cause by itself.
- Observed impact must come from selected evidence. Unknown impact must be
  stated explicitly and supported by the evidence that establishes the limit.

## Code and checkout rules

- Code citations must be repository-relative, stay inside the supplied checkout
  and point to a real one-based line number.
- A code citation supports what the checkout implements; it does not prove that
  the same revision was deployed.
- When the checkout is a Git repository, branch, commit and dirty state must
  match its current read-only Git state.
- Deployment correspondence remains `unknown` because the v1 handoff contains
  no independently verifiable deployment provenance.
