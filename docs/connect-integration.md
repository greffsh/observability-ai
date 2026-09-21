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

## Proveniência do deployment

O SDK OpenTelemetry incorpora os atributos padrão fornecidos por
`OTEL_RESOURCE_ATTRIBUTES` em métricas, logs e traces. O Analyzer consulta a
série `target_info` no Prometheus durante a janela do incidente e exporta a
revisão no handoff v2. Use a revisão completa e imutável como autoridade; branch
e tag servem apenas como contexto informativo.

Atributos esperados:

```text
service.version=<sha-ou-versão>
vcs.ref.head.revision=<sha-completo>
vcs.ref.head.name=<branch-ou-tag>
vcs.ref.head.type=<branch-ou-tag>
vcs.repository.url.full=<url-do-repositório>
```

Quando `vcs.ref.head.revision` não existe, o Analyzer registra
`service.version` como fallback e mantém essa origem explícita. Mais de uma
revisão observada na janela é preservada, o que evita declarar uma
correspondência exata durante rolling deployments. A injeção desses valores em
GitLab CI, Helm e Kubernetes está descrita em
[service-onboarding.md](service-onboarding.md#5-integrar-a-proveniência-ao-cicd).

## Execução local

Com a stack do Analyzer iniciada, execute o Connect fora de `development` e
aponte o endpoint OTLP para o Alloy:

```bash
cd /home/greff/eureka/sancor-connect
yarn build
CONNECT_SHA=$(git rev-parse HEAD)
CONNECT_REF=$(git branch --show-current)
APP_ENVIRONMENT=local \
OTEL_CONFIG='{"name":"connect-api","group":"sancor","environment":"local"}' \
OTEL_RESOURCE_ATTRIBUTES="service.version=${CONNECT_SHA},vcs.ref.head.revision=${CONNECT_SHA},vcs.ref.head.name=${CONNECT_REF},vcs.ref.head.type=branch,vcs.repository.url.full=https://gitlab.eurekalabs.com.br/sancor/sancor-connect" \
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
CONNECT_SHA=$(git rev-parse HEAD)
CONNECT_REF=$(git branch --show-current)
APP_ENVIRONMENT=local \
CONSULTAS_API_URL=http://127.0.0.1:65534 \
OTEL_CONFIG='{"name":"connect-api","group":"sancor","environment":"local"}' \
OTEL_RESOURCE_ATTRIBUTES="service.version=${CONNECT_SHA},vcs.ref.head.revision=${CONNECT_SHA},vcs.ref.head.name=${CONNECT_REF},vcs.ref.head.type=branch,vcs.repository.url.full=https://gitlab.eurekalabs.com.br/sancor/sancor-connect" \
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

No ensaio atual do checkout `sancor-connect-micros`, somente o gateway carrega
`./instrumentation` antes do NestJS. Os demais serviços mantêm sua inicialização
anterior; pelo menos um deles deve ser executado como downstream real durante o
teste integrado.

O gateway usa `service.name=micros-gateway` e é o sinal principal de impacto:
seu interceptor incrementa `http.server.requests` com `outcome=success|failure`,
compatível com a regra genérica e com o catálogo do Analyzer. Ele também exporta
logs de erro OTLP sanitizados e traces HTTP, com a instrumentação de filesystem
desabilitada. A extensão do trace aos micros downstream fica para uma etapa
posterior, quando houver um cenário que realmente exija localização interna.

Não existe um runner isolado de observabilidade. Com a stack Grafana AI e as
dependências normais dos micros já iniciadas, execute `domain-api` e gateway
pelos comandos usuais do monorepo, configurando a rota `domain` no gateway.
Valide primeiro `GET /domain/ping` e aguarde ao menos 15 segundos para exportar
a linha de base da métrica; depois interrompa `domain-api` e repita a mesma
chamada. A indisponibilidade real do downstream deve retornar `5xx` pelo
gateway e gerar métrica, log, trace, alerta e incidente de `micros-gateway`.
