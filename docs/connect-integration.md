# Integração local do Connect

O Connect envia métricas e logs de erro ao Alloy do Analyzer por OTLP/gRPC. A
identidade usada pela PoC é `service.name=connect` e
`deployment.environment.name=local`.

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
registrados pela integração HTTP compartilham o `requestId`, permitindo associar
a falha da dependência à rota de entrada no handoff.

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
OTEL_CONFIG='{"name":"connect","group":"sancor","environment":"local"}' \
OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:4317 \
OTEL_TRACES_EXPORTER=none \
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
OTEL_CONFIG='{"name":"connect","group":"sancor","environment":"local"}' \
OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:4317 \
OTEL_TRACES_EXPORTER=none \
OTEL_METRIC_EXPORT_INTERVAL=10000 \
OTEL_METRIC_EXPORT_TIMEOUT=5000 \
yarn start:prod
```

Com um Bearer válido, faça `GET /propostas?cd_usuario=observability-test`. O
resultado esperado é `502`: o log da Consultas API registra `ECONNREFUSED`, o
interceptor registra a rota `/propostas` e o counter produz o alerta HTTP. Após
a janela de avaliação, o Analyzer cria um incidente `scope:http`; o handoff deve
conter os dois logs correlacionados pelo `requestId`.

Falhas de startup por configuração ausente não passam pelo interceptor HTTP e
exigem uma regra externa de indisponibilidade, ainda fora deste contrato.
