# Integração local do Connect

O Connect envia métricas, logs de erro e traces ao Alloy do Analyzer por
OTLP/gRPC. A identidade usada pela PoC é `service.name=connect-api` e
`deployment.environment.name=local`. O entrypoint de instrumentação é carregado
antes do NestJS e das bibliotecas HTTP para que spans de entrada e saída sejam
criados e propagados corretamente.

## Sinais utilizados

O contrato mínimo possui somente um counter cumulativo:

| Significado | Métrica no Prometheus |
|---|---|
| Requisições | `http_server_requests_total` |
| Erros HTTP 5xx | `http_server_requests_total{outcome="failure"}` |

As séries `outcome=success` e `outcome=failure` são inicializadas em zero. O
Grafana avalia o aumento das falhas no último minuto e cria uma instância de
alerta para cada combinação de `service + environment`, com
`incident_scope=http`.

Para cada resposta `5xx`, o interceptor global também envia um log de erro com
método, template normalizado da rota, status, tipo, mensagem e stack trace.
Corpo, query string e valores concretos dos parâmetros não são incluídos. Erros
registrados pela integração HTTP compartilham o `requestId`, `traceId` e
`spanId`, permitindo associar a falha da dependência à rota de entrada e ao
trace no handoff. O contexto distribuído usa W3C `traceparent`/`tracestate`.

O catálogo do Connect usa apenas `totalRequests` e `failedRequests`. Sinais de
disponibilidade continuam suportados genericamente pelo Analyzer, mas não fazem
parte deste contrato porque exigem monitoramento externo ao processo.

## Execução local

Com a stack do Analyzer iniciada, execute o Connect fora de `development` e
aponte o endpoint OTLP para o Alloy:

```bash
cd /home/greff/eureka/sancor-connect
yarn build
APP_ENVIRONMENT=local \
OTEL_CONFIG='{"name":"connect-api","group":"sancor","environment":"local"}' \
OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:4317 \
OTEL_TRACES_EXPORTER=otlp \
OTEL_METRIC_EXPORT_INTERVAL=10000 \
OTEL_METRIC_EXPORT_TIMEOUT=5000 \
yarn start:prod
```

As demais variáveis continuam vindo do `.env` do Connect.

## Teste com falha orgânica

Inicie o Connect sobrescrevendo somente uma dependência HTTP para uma porta
offline:

```bash
APP_ENVIRONMENT=local \
CONSULTAS_API_URL=http://127.0.0.1:65534 \
OTEL_CONFIG='{"name":"connect-api","group":"sancor","environment":"local"}' \
OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:4317 \
OTEL_TRACES_EXPORTER=otlp \
OTEL_METRIC_EXPORT_INTERVAL=10000 \
OTEL_METRIC_EXPORT_TIMEOUT=5000 \
yarn start:prod
```

Com um Bearer válido, faça `GET /propostas?cd_usuario=observability-test`. O
resultado esperado é `502`: o log da Consultas API registra `ECONNREFUSED`, o
interceptor registra a rota `/propostas` e o counter produz o alerta HTTP. Após
a janela de avaliação, o Analyzer cria um incidente `scope:http`; o handoff deve
conter os logs correlacionados pelo `requestId`/`traceId` e evidências `traces-*`
com o span de servidor e as chamadas instrumentadas relevantes.

Para auditar a ingestão diretamente no Tempo:

```bash
curl --get http://localhost:3200/api/search \
  --data-urlencode 'q={ resource.service.name = "connect-api" && kind = server }' \
  --data-urlencode "start=$(date -d '10 minutes ago' +%s)" \
  --data-urlencode "end=$(date +%s)"
```

`OTEL_TRACES_EXPORTER=none` permanece disponível apenas para uma comparação
controlada sem traces; não é a configuração normal da integração.

Falhas de startup por configuração ausente não passam pelo interceptor HTTP e
exigem uma regra externa de indisponibilidade, ainda fora deste contrato.

## Connect em microserviços

No checkout `sancor-connect-micros`, todos os `main.ts` carregam
`@sancor/common-utils/instrumentation` antes do NestJS. O pacote compartilhado
configura logs de erro OTLP sanitizados, métricas com exportação a cada 10
segundos e traces; a instrumentação de filesystem fica desabilitada. Os
`.env.example` definem uma identidade distinta por micro.

O gateway usa `service.name=connect-gateway` e é o sinal principal de impacto:
seu interceptor incrementa `http.server.requests` com `outcome=success|failure`,
compatível com a regra genérica e com o catálogo do Analyzer. Os demais micros
não disparam impacto externo por conta própria, mas participam do mesmo trace
para localizar a chamada interna com falha. A instrumentação HTTP propaga W3C
automaticamente; o CLS copia o span ativo, usando `x-trace-id`/`x-span-id`
somente como fallback temporário.
