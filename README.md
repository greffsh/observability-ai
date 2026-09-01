# Grafana AI

PoC local de RCA assistido por IA a partir de alertas do Grafana. Requisitos,
decisões e progresso ficam em [CHECKPOINTS.md](CHECKPOINTS.md). Considerações
para uma implantação futura ficam em [HOMOLOGACAO.md](HOMOLOGACAO.md).

## Pré-requisitos

- Docker com Docker Compose;
- portas locais 3000, 3100, 4317, 4318, 8080, 8081, 9090 e 12345 disponíveis.

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
curl --fail http://localhost:9090/-/ready
curl --fail http://localhost:3100/ready
curl --fail http://localhost:12345/-/ready
curl --fail http://localhost:3000/api/health
```

Interfaces locais:

| Componente | Endereço |
|---|---|
| Analyzer | <http://localhost:8080/health> |
| checkout-api | <http://localhost:8081/health> |
| Grafana | <http://localhost:3000> |
| Prometheus | <http://localhost:9090> |
| Loki | <http://localhost:3100/ready> |
| Alloy | <http://localhost:12345> |

O usuário e a senha do Grafana são definidos em `.env`.

## Falha controlada da checkout-api

O checkout começa saudável:

```bash
curl --fail http://localhost:8081/checkout
```

Ative a degradação e confirme que somente o checkout responde HTTP `503`:

```bash
curl --request POST http://localhost:8081/control/failure
curl --include http://localhost:8081/checkout
curl --fail http://localhost:8081/health
```

Para o cenário de indisponibilidade, registre a mudança e derrube também o
health check:

```bash
curl --request POST http://localhost:8081/control/change
curl --request POST http://localhost:8081/control/failure/unavailable
curl --include http://localhost:8081/health
```

Interrompa a falha e confirme a recuperação:

```bash
curl --request DELETE http://localhost:8081/control/failure
curl --fail http://localhost:8081/checkout
```

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
`checkout_failed` e `failure_mode_changed`. Todos contêm serviço, ambiente,
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
- `checkout_request_duration_seconds`: histograma de duração por resultado;
- `checkout_failure_mode`: `1` durante a falha controlada e `0` fora dela.

O endpoint bruto pode ser auditado em <http://localhost:8081/metrics>.

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

Consulte o evento persistido usando o mesmo Bearer:

```bash
curl --header "Authorization: Bearer change-me-webhook" \
  "http://localhost:8080/v1/events/manual-checkout-failure:firing:2026-08-28T09:00:00.000Z"
```

O resultado inclui o UUID do evento no banco, o `incidentId` correlacionado,
o horário de persistência e o contrato interno normalizado. Use esse
`incidentId` para consultar o ciclo de vida da ocorrência:

```bash
curl --header "Authorization: Bearer change-me-webhook" \
  "http://localhost:8080/v1/incidents/UUID-DO-INCIDENTE"
```

O incidente informa seu estado (`open`, `awaiting_confirmation` ou `closed`),
seu intervalo de atividade e as ocorrências associadas. Cada ocorrência mantém
a identidade e o ciclo do alerta, incluindo `firingObserved`. Um evento
`resolved` encerra sua ocorrência; o incidente só deixa de estar `open` quando
nenhuma ocorrência associada permanece aberta.

Um operador pode encerrar um incidente em `awaiting_confirmation` usando sua
credencial própria:

```bash
curl --request PUT \
  --header "Authorization: Bearer change-me-operator" \
  --json '{"reason":"recovery_confirmed","note":"Recuperação validada"}' \
  "http://localhost:8080/v1/incidents/UUID-DO-INCIDENTE/closure"
```

O fechamento é idempotente e auditável. Incidentes com ocorrências abertas
retornam `409`; a credencial do webhook do Grafana não autoriza essa operação.
Uma ocorrência posterior a um incidente encerrado inicia outro incidente.

Para coletar as evidências e executar a classificação determinística:

```bash
curl --request POST \
  --header "Authorization: Bearer change-me-webhook" \
  "http://localhost:8080/v1/incidents/UUID-DO-INCIDENTE/severity"
```

A resposta contém `assessment` com a severidade recomendada, os sinais
calculados, as regras acionadas, observações e limitações, além do
`evidencePackage` usado na decisão. A mudança recente é relatada como contexto;
ela não é usada como prova de causa.

O valor acima é somente o padrão local. Um segredo real não deve ser escrito
em comandos compartilhados, documentação ou logs.

## Auditar o alerta local

O Grafana provisiona uma regra que dispara quando `checkout_failure_mode` vale
`1` e encaminha as transições ao Analyzer. Para exercitar o fluxo completo:

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

## Migrations do Analyzer

O Analyzer aplica migrations do PostgreSQL antes de abrir a porta HTTP. Para
executá-las manualmente fora do container:

```bash
cd services/analyzer
DATABASE_URL=postgresql://usuario:senha@host:5432/banco pnpm migrate
```

As migrations ficam em `services/analyzer/src/migrations`. A tabela
`effect_sql_migrations` registra quais versões já foram aplicadas.

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
