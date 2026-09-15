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
  "http://localhost:8080/v1/incidents?status=open&service=connect-api&environment=local"
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
    "service": "connect-api",
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

## Entrada da skill e checkout local

A skill aceita o contexto do incidente de três formas: caminho para um handoff
salvo, objeto JSON completo enviado na conversa ou `incident_id`. O checkout
local continua sendo uma entrada separada e explícita em todos os casos.

Com um arquivo existente:

```text
$incident-rca analise ./rca-handoff-UUID.json usando o checkout
/caminho/para/o/checkout e salve o resultado em ./rca-UUID.md
```

Com o JSON, o operador pode colar o objeto completo junto ao pedido. A skill o
valida e salva antes da análise, preservando o snapshot utilizado.

Com um ID, a própria skill chama o endpoint autenticado de handoff:

```text
$incident-rca analise o incidente UUID usando o checkout
/caminho/para/o/checkout
```

Internamente, o helper `scripts/fetch_handoff.py` chama
`POST /v1/incidents/:incidentId/rca-handoff`. Ele usa `ANALYZER_URL` quando
configurada ou o Analyzer local na porta `ANALYZER_PORT`, e obtém
`ANALYZER_OPERATOR_TOKEN` do ambiente ou do `.env` sem imprimi-lo. A resposta é
salva como artefato local antes da geração do diagnóstico. Um erro de rede,
autenticação ou incidente inexistente interrompe a análise; a skill não escolhe
outro incidente.

A revisão e a fidelidade do checkout são responsabilidade explícita do
operador. A skill mantém o checkout somente para leitura e valida o relatório
Markdown contra o handoff salvo e as referências reais de arquivo e linha.
