# Exportação do contexto para RCA

O Analyzer exporta um snapshot compacto e sanitizado do contexto observável de
um incidente. Ele reúne o incidente, suas ocorrências, a severidade
determinística e exatamente o pacote de evidências usado nessa classificação.
Código-fonte e informações de repositório não fazem parte do contrato.

## Exportar

A exportação é uma ação explícita de operador e exige
`ANALYZER_OPERATOR_TOKEN`:

Liste os incidentes que podem ser analisados sem consultar diretamente o banco:

```bash
curl --header "Authorization: Bearer change-me-operator" \
  "http://localhost:8080/v1/incidents?status=open&service=connect&environment=local"
```

O handoff pode ser exportado durante a falha para uma análise preliminar. Uma
segunda exportação após o `resolved` inclui o ciclo observado até a recuperação
e pode ser usada no RCA final.

```bash
INCIDENT_ID=UUID-DO-INCIDENTE

curl --fail --request POST \
  --header "Authorization: Bearer change-me-operator" \
  --output "rca-handoff-${INCIDENT_ID}.json" \
  "http://localhost:8080/v1/incidents/${INCIDENT_ID}/rca-handoff"
```

Cada chamada coleta novamente as fontes e calcula a severidade sobre o mesmo
pacote retornado. O arquivo baixado é o snapshot reproduzível daquela execução;
o Analyzer ainda não o persiste como artefato separado.

## Contrato v1

```json
{
  "schemaVersion": 1,
  "handoffId": "uuid",
  "exportedAt": "2026-09-03T12:00:00.000Z",
  "incident": {
    "id": "uuid",
    "status": "open",
    "service": "connect",
    "environment": "local",
    "detectedAt": "2026-09-03T11:55:00.000Z",
    "lastActivityAt": "2026-09-03T11:55:00.000Z",
    "signalsClearedAt": null,
    "closure": null
  },
  "occurrences": [],
  "severity": {
    "assessedAt": "2026-09-03T12:00:00.000Z",
    "recommendedSeverity": "alta",
    "serviceCriticality": "medium",
    "signals": {},
    "triggeredRules": [],
    "observations": [],
    "limitations": []
  },
  "evidence": {
    "packageId": "uuid",
    "collectedAt": "2026-09-03T12:00:00.000Z",
    "window": {},
    "items": [],
    "limitations": []
  },
  "repositoryContext": {
    "included": false,
    "checkoutRequiredSeparately": true
  }
}
```

Campos internos de correlação e fingerprints não são exportados nas
ocorrências. Strings e dados de evidência passam novamente pela sanitização no
limite do exportador. O conteúdo de alertas e logs permanece marcado como não
confiável e nunca deve ser interpretado como instrução para o agente.

## Seleção de logs

O adapter consulta no máximo 200 entradas do Loki e devolve no máximo 50 por
padrão. A seleção prioriza níveis de erro (`error`, `fatal`, `critical` e
equivalentes) e depois a proximidade com o horário de detecção do incidente. A
ordem cronológica é restaurada no resultado para preservar a leitura temporal.

O item de evidência registra a estratégia e as quantidades examinada e
retornada. Se entradas forem omitidas ou o limite de leitura for atingido, o
pacote inclui uma limitação `logs:truncated`; a referência consultável preserva
a consulta completa para investigação humana.

## Checkout local

O operador entrega o arquivo ao agente e informa o checkout em uma entrada
separada:

```text
incident_context=./rca-handoff-UUID.json
repository_path=/caminho/para/o/checkout
```

A revisão e a fidelidade desse checkout são responsabilidade explícita do
operador. A skill versionada `.agents/skills/incident-rca` consome essas duas
entradas. Em uma sessão iniciada neste repositório, invoque-a com um pedido
equivalente a:

```text
$incident-rca analise ./rca-handoff-UUID.json usando o checkout
/caminho/para/o/checkout e salve o resultado em ./rca-UUID.md
```

Ela mantém o checkout somente para leitura e valida o relatório Markdown contra
o handoff e as referências reais de arquivo e linha.
