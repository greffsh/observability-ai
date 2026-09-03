# Integração local do Connect

## Diagnóstico anterior à integração

O Connect é uma aplicação Node.js 20 com NestJS 10, executada em desenvolvimento
com `yarn dev` e em modo compilado com `yarn build && yarn start:prod`. Seu Compose
local contém apenas Redis, LocalStack e um inicializador AWS; ele não contém nem
passou a conter Grafana, Prometheus, Loki ou Collector.

Antes desta integração, o Connect escrevia logs JSON em `stdout` por Winston e
inicializava o NodeSDK do OpenTelemetry somente fora de `development`. O SDK
exportava apenas traces por OTLP/gRPC. O endpoint era controlado pela variável
padrão `OTEL_EXPORTER_OTLP_ENDPOINT` e, sem configuração, usava o padrão do
exporter gRPC. O recurso usava `service.name=connect-api`, `group=sancor` e o
atributo incorreto `deploymnent.environment`; não havia exporter de logs ou
métricas, counters, disponibilidade, estado de falha ou timestamp de mudança.

Nenhuma configuração externa de Grafana, Prometheus, Loki ou Collector foi
encontrada no repositório do Connect. Na integração local, o processo no host
alcança o Alloy do Analyzer por `127.0.0.1:4317`. Essa porta não tem autenticação
nem TLS e só deve ser usada assim em localhost ou rede privada de desenvolvimento.

## Sinais adicionados

A identidade OTLP canônica é `service.name=connect` e
`deployment.environment.name=local`. Os logs continuam em `stdout` e também são
enviados por OTLP/gRPC. Os sinais métricos são:

| Significado | Métrica no Prometheus | Tipo/temporariedade |
|---|---|---|
| Requisições | `connect_http_requests_total` | counter cumulativo |
| Erros HTTP 5xx | `connect_http_requests_total{outcome="failure"}` | série do counter cumulativo de requisições |
| Falha controlada ativa | `connect_failure_state` | gauge, `0` ou `1` |
| Disponibilidade | `connect_availability` | gauge, `0` ou `1` |
| Última mudança | `connect_last_change_timestamp_seconds` | gauge com timestamp Unix em segundos |

As séries cumulativas de requisições usam apenas o resultado estável
`success`/`failure`. A mesma métrica fornece o total e, com o filtro
`outcome="failure"`, as falhas, sem um counter dedicado redundante. As duas séries
são inicializadas em zero para que o Analyzer possua uma amostra-base antes do
primeiro erro. Se uma fonte externa entregar um counter já positivo sem essa
amostra-base, o Analyzer não o converte silenciosamente em zero: retorna o sinal
como desconhecido e registra `metrics:counter_baseline_missing`.

O catálogo usa exatamente esses nomes. Para esta PoC local, a criticidade foi
registrada conservadoramente como `medium` e o teto como `alta`; essa premissa
operacional precisa ser validada antes de cadastrar outro ambiente.

## Execução local

Com a stack do Analyzer já iniciada, compile e execute o Connect no host. As
credenciais AWS abaixo são apenas as credenciais fixas do LocalStack versionadas
no Compose do próprio Connect.

```bash
cd /home/greff/eureka/sancor-connect
docker compose up --detach
yarn build
APP_ENVIRONMENT=local \
PORT=3030 \
CONNECT_MICROS_BASE_URL=http://127.0.0.1 \
PAY2B_IBM_AUTH_BASIC=test \
AWS_ACCESS_KEY_ID=test \
AWS_SECRET_ACCESS_KEY=test \
AWS_DEFAULT_REGION=us-east-1 \
OTEL_CONFIG='{"name":"connect","group":"sancor","environment":"local"}' \
OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:4317 \
OTEL_METRIC_EXPORT_INTERVAL=5000 \
OTEL_NODE_RESOURCE_DETECTORS=none \
OTEL_TRACES_EXPORTER=none \
OBSERVABILITY_TEST_CONTROL_ENABLED=true \
yarn start:prod
```

`OBSERVABILITY_TEST_CONTROL_ENABLED` é `false` por padrão. Quando habilitada
explicitamente, a falha controlada torna `GET /ping` indisponível sem alterar as
integrações de negócio:

```bash
curl --request POST http://127.0.0.1:3030/internal/observability/failure
curl --include http://127.0.0.1:3030/ping
curl --request DELETE http://127.0.0.1:3030/internal/observability/failure
curl --fail http://127.0.0.1:3030/ping
```

O Grafana avalia `connect_failure_state` a cada 10 segundos. A regra inclui as
labels `service=connect` e `environment=local`, usa o contact point genérico do
Analyzer e envia tanto `firing` quanto `resolved`. Como essa regra representa o
controle explícito e não a ausência do processo, `NoData` permanece normal. Uma
falha abrupta do processo exigiria outro sinal externo de disponibilidade; ela
não é coberta por esta integração.

O Connect possui auto-instrumentação de traces nos demais ambientes. O Alloy
desta PoC não provisiona um pipeline para eles; por isso a execução local usa
`OTEL_TRACES_EXPORTER=none`. Armazenamento e consulta de traces permanecem fora
do escopo. A execução também desabilita os detectores automáticos de recurso
para que nome do host, usuário e caminho do processo não sejam enviados à PoC;
somente a identidade explícita do serviço é necessária para este teste.
