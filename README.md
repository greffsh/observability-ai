# Grafana AI

PoC local de RCA assistido por IA a partir de alertas do Grafana. Requisitos,
decisões e progresso ficam em [CHECKPOINTS.md](CHECKPOINTS.md). Considerações
para uma implantação futura ficam em [HOMOLOGACAO.md](HOMOLOGACAO.md).

## Pré-requisitos

- Docker com Docker Compose;
- portas locais 3000, 3100, 3200, 4317, 4318, 8080, 8081, 8082, 9090 e 12345 disponíveis.

Node.js e pnpm são necessários apenas para desenvolver as aplicações
TypeScript fora dos containers.

## Configuração

Crie seu arquivo local de ambiente:

```bash
cp .env.example .env
```

Troque as senhas marcadas com `change-me` antes de utilizar dados reais. O
arquivo `.env` não é versionado.

## Iniciar

```bash
docker compose up --build --detach
```

Verifique o estado:

```bash
docker compose ps
curl --fail http://localhost:8080/health
curl --fail http://localhost:8081/health
curl --fail http://localhost:8082/healthz
curl --fail http://localhost:9090/-/ready
curl --fail http://localhost:3100/ready
curl --fail http://localhost:3200/ready
curl --fail http://localhost:12345/-/ready
curl --fail http://localhost:3000/api/health
```

Interfaces locais:

| Componente | Endereço |
|---|---|
| Analyzer | <http://localhost:8080/health> |
| checkout-api | <http://localhost:8081/health> |
| Interface do operador | <http://localhost:8082> |
| Grafana | <http://localhost:3000> |
| Prometheus | <http://localhost:9090> |
| Loki | <http://localhost:3100/ready> |
| Tempo | <http://localhost:3200/ready> |
| Alloy | <http://localhost:12345> |

O usuário e a senha do Grafana são definidos em `.env`.

## Interface do operador

Abra <http://localhost:8082> e informe o valor local de
`ANALYZER_OPERATOR_TOKEN`. A credencial permanece somente no `sessionStorage`
do navegador. A interface lista os incidentes em abas por status, apresenta
datas relativas com horário exato sob demanda e abre os detalhes e ocorrências
ao selecionar uma linha. O ID pode ser copiado diretamente. Para incidentes
abertos ou aguardando confirmação, a interface gera um novo handoff e copia o
JSON para o clipboard. Incidentes aguardando confirmação também podem ser
encerrados pela interface, com motivo auditável e nota opcional.

Incidentes abertos não podem ser encerrados enquanto houver ocorrências ativas.
Incidentes mesclados não aparecem na listagem operacional padrão e incidentes
encerrados não oferecem ações. O navegador precisa permitir acesso
ao clipboard; `localhost` é considerado um contexto seguro pelos navegadores
modernos.

## Falha controlada da checkout-api

A aplicação possui um único modo de falha. Ela começa saudável:

```bash
curl --fail http://localhost:8081/health
curl --fail http://localhost:8081/checkout
```

Ative a falha e confirme que o health check e o checkout respondem HTTP `503`:

```bash
curl --request POST http://localhost:8081/control/failure
curl --include http://localhost:8081/health
curl --include http://localhost:8081/checkout
```

Interrompa a falha e confirme a recuperação:

```bash
curl --request DELETE http://localhost:8081/control/failure
curl --fail http://localhost:8081/health
curl --fail http://localhost:8081/checkout
```

A superfície HTTP está limitada a `/health`, `/checkout`, `/metrics` e às duas
operações de ativação e recuperação acima.

## Logs da checkout-api

A aplicação escreve logs JSON em `stdout`. O Alloy coleta somente os logs do
serviço `checkout-api` e os encaminha ao Loki.

Para consultar todos os logs no Grafana, abra **Explore**, selecione o datasource
**Loki** e execute:

```logql
{service="checkout-api", environment="local"} | json
```

Para exibir somente a falha controlada:

```logql
{service="checkout-api", environment="local"} | json | event="checkout_failed"
```

Os eventos semânticos atuais são `service_started`, `checkout_completed`,
`checkout_failed` e `failure_state_changed`. Todos contêm serviço, ambiente,
timestamp e nível; eventos de requisição também contêm `reqId`.
O logging automático de requests está desabilitado, portanto as sondagens
periódicas em `/health` e `/metrics` não geram entradas no Loki.

No ambiente local, o Alloy recebe acesso ao socket Docker para descobrir e ler
os logs do container. Mesmo montado como somente leitura, esse socket concede
privilégios relevantes sobre o daemon e não deve ser exposto nem reproduzido em
produção sem uma estratégia de isolamento apropriada.

## Métricas da checkout-api

O Prometheus coleta `http://checkout-api:8081/metrics` a cada 15 segundos. No
Grafana, abra **Explore**, selecione **Prometheus** e consulte:

```promql
checkout_requests_total{service="checkout-api", environment="local"}
```

Métricas disponíveis:

- `checkout_requests_total`: operações por resultado e status HTTP;
- `checkout_availability`: `1` quando saudável e `0` durante a falha controlada.

O endpoint bruto pode ser auditado em <http://localhost:8081/metrics>.

## Traces distribuídos

O Alloy recebe traces OTLP e os encaminha ao Tempo. O datasource **Tempo** é
provisionado no Grafana; em **Explore**, uma consulta TraceQL por serviço pode
ser executada com:

```traceql
{ resource.service.name = "connect-api" && kind = server }
```

O Analyzer usa a mesma restrição a spans de servidor para evitar traces de
startup e seleciona no máximo três traces, com até cem spans sanitizados em
cada um. A referência integral do trace permanece no item de evidência. A
propagação entre serviços deve usar W3C `traceparent`/`tracestate`; headers
próprios de correlação não substituem esse contexto.

## Encerrar

```bash
docker compose down
```

Os volumes são preservados. Para apagá-los deliberadamente, use
`docker compose down --volumes` somente quando os dados locais não forem mais
necessários.

## Analyzer fora do container

```bash
cd services/analyzer
pnpm install
pnpm typecheck
pnpm dev
```

Para desenvolver a aplicação demonstrativa, use os mesmos comandos em
`services/checkout-api`; sua porta padrão é `8081`.

Para desenvolver a interface fora do container, mantenha o Analyzer na porta
`8080` e execute:

```bash
cd services/operator-ui
pnpm install
pnpm dev
```

O servidor Vite abre a porta `8082` e encaminha `/api` ao Analyzer sem exigir
CORS.

## Webhook do Analyzer

O Analyzer recebe webhooks em `POST /v1/webhooks/grafana`. A requisição deve
usar `Content-Type: application/json` e autenticação Bearer com o valor de
`GRAFANA_WEBHOOK_SECRET`.

```bash
curl --header "Authorization: Bearer change-me-webhook" \
  --json '{"status":"firing","alerts":[{"status":"firing","labels":{"alertname":"CheckoutFailureRateHigh","service":"checkout-api","environment":"local"},"startsAt":"2026-08-28T09:00:00Z","endsAt":"0001-01-01T00:00:00Z","fingerprint":"manual-checkout-failure"}]}' \
  http://localhost:8080/v1/webhooks/grafana
```

Uma entrega nova retorna `inserted: 1`; o reenvio do mesmo `eventId` retorna
`duplicates: 1` e continua sendo reconhecido com HTTP `202`:

```json
{
  "accepted": 1,
  "inserted": 1,
  "duplicates": 0,
  "eventIds": ["manual-checkout-failure:firing:2026-08-28T09:00:00.000Z"]
}
```

Os IDs de evento existem para deduplicação e auditoria internas. O fluxo normal
do operador começa pela listagem de incidentes e usa
`ANALYZER_OPERATOR_TOKEN`, não a credencial do Grafana:

```bash
curl --header "Authorization: Bearer change-me-operator" \
  "http://localhost:8080/v1/incidents?status=open&service=checkout-api&environment=local"
```

Os filtros `status`, `service` e `environment` são opcionais. A resposta traz no
máximo os 100 incidentes mais recentes e informa quantos alertas continuam ativos.
Use o `id` retornado para consultar os detalhes:

```bash
curl --header "Authorization: Bearer change-me-operator" \
  "http://localhost:8080/v1/incidents/UUID-DO-INCIDENTE"
```

O incidente informa seu estado (`open`, `awaiting_confirmation` ou `closed`),
seu intervalo de atividade e as ocorrências associadas. Cada ocorrência mantém
a identidade e o ciclo do alerta, incluindo `firingObserved`. Um evento
`resolved` encerra sua ocorrência; o incidente só deixa de estar `open` quando
nenhuma ocorrência associada permanece aberta.

O operador pode exportar o contexto do RCA a qualquer momento, inclusive com o
incidente ainda `open`:

```bash
curl --fail --request POST \
  --header "Authorization: Bearer change-me-operator" \
  --output rca-handoff.json \
  "http://localhost:8080/v1/incidents/UUID-DO-INCIDENTE/rca-handoff"
```

Essa única operação coleta as evidências, calcula a severidade e devolve o
snapshot sanitizado para o agente. Evidência e severidade não possuem endpoints
operacionais separados. A recuperação do serviço não é pré-requisito: um
handoff durante a falha serve para análise preliminar, e uma nova exportação
depois do `resolved` pode alimentar o RCA final.

Depois que todos os alertas forem resolvidos, um operador pode encerrar o
incidente em `awaiting_confirmation`:

```bash
curl --request PUT \
  --header "Authorization: Bearer change-me-operator" \
  --json '{"reason":"recovery_confirmed","note":"Recuperação validada"}' \
  "http://localhost:8080/v1/incidents/UUID-DO-INCIDENTE/closure"
```

O fechamento é idempotente e auditável. Incidentes com ocorrências abertas
retornam `409`; a credencial do webhook do Grafana não autoriza leitura,
handoff ou encerramento. Uma ocorrência posterior a um incidente encerrado
inicia outro incidente.

O Analyzer não acessa repositórios e não chama um modelo de IA. O operador
fornece à skill um arquivo de handoff, o JSON completo ou um `incident_id` e
aponta, como entrada separada, o checkout local que poderá ser analisado. Quando
recebe um ID, a skill busca o handoff no endpoint autenticado do Analyzer e
salva o snapshot antes da análise. O contrato, a seleção limitada de logs e as
garantias desse limite estão em
[docs/rca-handoff.md](docs/rca-handoff.md). A skill está versionada em
`.agents/skills/incident-rca` e pode ser invocada como `$incident-rca` em uma
sessão iniciada neste repositório.

Serviços adicionais são cadastrados em
`infra/analyzer/service-catalog.json`. O perfil liga métricas próprias a sinais
de impacto normalizados sem alterar as regras de severidade. A stack também
recebe logs, métricas e traces OpenTelemetry por OTLP; consulte o
[guia de onboarding](docs/service-onboarding.md) para identidade, configuração
e limitações de segurança. O diagnóstico, os sinais e o procedimento reproduzível
da integração local do Connect estão em
[docs/connect-integration.md](docs/connect-integration.md).

O valor acima é somente o padrão local. Um segredo real não deve ser escrito
em comandos compartilhados, documentação ou logs.

## Auditar o alerta local

O Grafana provisiona uma regra que dispara quando `checkout_availability` vale
`0` e encaminha as transições ao Analyzer. Para exercitar o fluxo completo:

```bash
curl --request POST http://localhost:8081/control/failure
docker compose logs --follow analyzer
```

A coleta do Prometheus ocorre a cada 15 segundos e a avaliação da regra a cada
10 segundos, então a notificação pode levar alguns segundos. Após observar o
evento `grafana_webhook_accepted`, restaure o estado saudável:

```bash
curl --request DELETE http://localhost:8081/control/failure
```

O Analyzer registra apenas os IDs dos eventos normalizados, não o corpo bruto
do webhook. As configurações versionadas ficam em
`infra/grafana/provisioning/alerting`.

## Limpar os dados locais do Analyzer

A stack local habilita um endpoint destrutivo para remover todos os eventos,
ocorrências, incidentes e auditorias de correlação, preservando apenas o schema
e o histórico de migrations:

```bash
curl --fail --request DELETE \
  --header "Authorization: Bearer change-me-operator" \
  --header "X-Confirm-Database-Reset: true" \
  http://localhost:8080/v1/admin/database
```

A resposta esperada é `{"status":"cleared"}`. O endpoint usa a credencial do
operador, exige confirmação explícita e só é registrado quando
`ANALYZER_DATABASE_RESET_ENABLED=true`. Essa opção é habilitada pelo Compose
local e deve permanecer desabilitada fora de ambientes descartáveis.

## Migrations do Analyzer

O Analyzer aplica migrations do PostgreSQL antes de abrir a porta HTTP. Para
executá-las manualmente fora do container:

```bash
cd services/analyzer
DATABASE_URL=postgresql://usuario:senha@host:5432/banco pnpm migrate
```

As migrations ficam em `services/analyzer/src/migrations`. A tabela
`effect_sql_migrations` registra quais versões já foram aplicadas.

Enquanto a PoC ainda não possui banco persistente, o schema foi consolidado em
uma única baseline (`0001_initial_schema`). Um ambiente que tenha aplicado a
cadeia anterior `0001`–`0006` deve recriar o banco antes de usar esta versão. A
baseline e o adapter PostgreSQL podem ser validados juntos em um banco efêmero:

```bash
cd services/analyzer
pnpm test:postgres
```

Depois que um banco persistente passar a existir, mudanças de schema devem ser
feitas somente por novas migrations incrementais; a baseline não deve ser
reescrita.

## Logs do Analyzer

Os casos de uso emitem logs com `Effect.log*`. Um adapter preserva níveis,
annotations, spans, causas e identidade da fiber e encaminha tudo para uma
única instância Pino com destino assíncrono em `stdout`. O Fastify reutiliza a
mesma instância apenas para seus logs internos.

```bash
docker compose logs --follow analyzer
```

O logging automático de requests está desabilitado. Eventos semânticos, como
`grafana_webhook_accepted`, carregam `reqId` e os demais campos no mesmo objeto
JSON. No encerramento gracioso, o Analyzer fecha o servidor e descarrega o
buffer do Pino; uma interrupção abrupta como `SIGKILL` ainda pode perder as
últimas mensagens em memória.
