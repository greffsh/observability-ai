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

Ative a falha e confirme uma resposta HTTP `503`:

```bash
curl --request POST http://localhost:8081/control/failure
curl --include http://localhost:8081/checkout
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

No ambiente local, o Alloy recebe acesso ao socket Docker para descobrir e ler
os logs do container. Mesmo montado como somente leitura, esse socket concede
privilégios relevantes sobre o daemon e não deve ser exposto nem reproduzido em
produção sem uma estratégia de isolamento apropriada.

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
