#!/usr/bin/env bash

set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT_DIR/.env"

if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

ANALYZER_PORT="${ANALYZER_PORT:-8080}"
CHECKOUT_API_PORT="${CHECKOUT_API_PORT:-8081}"
GRAFANA_WEBHOOK_SECRET="${GRAFANA_WEBHOOK_SECRET:-change-me-webhook}"
ANALYZER_OPERATOR_TOKEN="${ANALYZER_OPERATOR_TOKEN:-change-me-operator}"

ANALYZER_URL="http://localhost:${ANALYZER_PORT}"
CHECKOUT_URL="http://localhost:${CHECKOUT_API_PORT}"
OPERATOR_AUTH_HEADER="Authorization: Bearer ${ANALYZER_OPERATOR_TOKEN}"

CURRENT_STAGE="inicialização"
FAILURE_ENABLED=false

info() {
  printf '\n\033[1;34m==> %s\033[0m\n' "$1"
}

ok() {
  printf '\033[1;32m✓ %s\033[0m\n' "$1"
}

fail() {
  printf '\033[1;31m✗ %s\033[0m\n' "$1" >&2
  exit 1
}

on_error() {
  local exit_code=$?
  printf '\n\033[1;31mO teste falhou durante: %s\033[0m\n' "$CURRENT_STAGE" >&2
  printf 'Consulte os logs com: docker compose logs --tail=100 analyzer grafana checkout-api\n' >&2
  exit "$exit_code"
}

cleanup() {
  if [[ "$FAILURE_ENABLED" == true ]]; then
    curl --silent --output /dev/null --request DELETE "$CHECKOUT_URL/control/failure" || true
  fi
}

trap on_error ERR
trap cleanup EXIT

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "Comando obrigatório não encontrado: $1"
}

http_status() {
  curl --silent --output /dev/null --write-out '%{http_code}' "$@"
}

wait_for_http() {
  local description=$1
  local expected=$2
  local url=$3
  local timeout=${4:-120}
  local elapsed=0
  local actual

  while (( elapsed < timeout )); do
    actual="$(http_status "$url" || true)"
    if [[ "$actual" == "$expected" ]]; then
      ok "$description respondeu HTTP $expected"
      return 0
    fi
    sleep 2
    elapsed=$((elapsed + 2))
  done

  fail "$description não respondeu HTTP $expected em ${timeout}s (último: ${actual:-sem resposta})"
}

operator_get() {
  curl --fail --silent --show-error \
    --header "$OPERATOR_AUTH_HEADER" \
    "$ANALYZER_URL$1"
}

wait_for_open_incident() {
  local timeout=${1:-150}
  local elapsed=0
  local incident_id

  while (( elapsed < timeout )); do
    incident_id="$(
      operator_get "/v1/incidents?status=open&service=checkout-api&environment=local" |
        jq -r '.incidents[0].id // empty'
    )"
    if [[ -n "$incident_id" ]]; then
      printf '%s' "$incident_id"
      return 0
    fi
    sleep 5
    elapsed=$((elapsed + 5))
  done

  fail "O incidente aberto da checkout-api não apareceu em ${timeout}s"
}

wait_for_incident_status() {
  local incident_id=$1
  local expected=$2
  local timeout=${3:-150}
  local elapsed=0
  local actual

  while (( elapsed < timeout )); do
    actual="$(operator_get "/v1/incidents/$incident_id" | jq -r '.status')"
    if [[ "$actual" == "$expected" ]]; then
      ok "Incidente chegou ao estado $expected"
      return 0
    fi
    sleep 5
    elapsed=$((elapsed + 5))
  done

  fail "Incidente não chegou a $expected em ${timeout}s (último: ${actual:-desconhecido})"
}

close_incident() {
  curl --fail --silent --show-error \
    --request PUT \
    --header "$OPERATOR_AUTH_HEADER" \
    --header 'Content-Type: application/json' \
    --data '{"reason":"recovery_confirmed","note":"Manual end-to-end flow validated"}' \
    "$ANALYZER_URL/v1/incidents/$1/closure"
}

CURRENT_STAGE="verificação das dependências"
for command_name in curl docker jq; do
  require_command "$command_name"
done
docker compose version >/dev/null

[[ -f "$ENV_FILE" ]] || fail "Arquivo .env não encontrado em $ROOT_DIR"

if [[ "$GRAFANA_WEBHOOK_SECRET" == "change-me-webhook" ]]; then
  printf '\033[1;33mAviso: GRAFANA_WEBHOOK_SECRET ainda usa o valor local padrão.\033[0m\n'
fi

cd "$ROOT_DIR"

CURRENT_STAGE="subida dos containers"
info "1/7 — Construindo e iniciando a stack"
docker compose up --detach --build
wait_for_http "Analyzer" 200 "$ANALYZER_URL/health"
wait_for_http "checkout-api" 200 "$CHECKOUT_URL/health"

CURRENT_STAGE="preparação do estado saudável"
info "2/7 — Garantindo que a checkout-api começa saudável"
curl --fail --silent --show-error --request DELETE "$CHECKOUT_URL/control/failure" | jq .
wait_for_http "Health da checkout-api" 200 "$CHECKOUT_URL/health" 30
wait_for_http "Checkout" 200 "$CHECKOUT_URL/checkout" 30
sleep 12

CURRENT_STAGE="ativação da indisponibilidade"
info "3/7 — Simulando indisponibilidade"
curl --fail --silent --show-error --request POST "$CHECKOUT_URL/control/failure" | jq .
FAILURE_ENABLED=true

[[ "$(http_status "$CHECKOUT_URL/health")" == 503 ]] || fail "Health deveria retornar 503"
[[ "$(http_status "$CHECKOUT_URL/checkout")" == 503 ]] || fail "Checkout deveria retornar 503"
ok "checkout-api está indisponível como esperado"

CURRENT_STAGE="recebimento do alerta"
info "4/7 — Esperando o Grafana criar o incidente"
INCIDENT_ID="$(wait_for_open_incident 150)"
incident_json="$(operator_get "/v1/incidents/$INCIDENT_ID")"
printf '%s\n' "$incident_json" | jq .
[[ "$(jq -r '.status' <<<"$incident_json")" == open ]] || fail "O incidente deveria estar open"
[[ "$(jq '[.occurrences[] | select(.status == "open")] | length' <<<"$incident_json")" -ge 1 ]] || \
  fail "O incidente deveria ter ao menos um alerta ativo"
ok "Incidente aberto encontrado pela interface do Analyzer: $INCIDENT_ID"

CURRENT_STAGE="exportação do handoff preliminar"
info "5/7 — Exportando o handoff enquanto a falha está aberta"
HANDOFF_PATH="$ROOT_DIR/rca-handoff-${INCIDENT_ID}.json"
curl --fail --silent --show-error \
  --request POST \
  --header "$OPERATOR_AUTH_HEADER" \
  --output "$HANDOFF_PATH" \
  "$ANALYZER_URL/v1/incidents/$INCIDENT_ID/rca-handoff"

jq . "$HANDOFF_PATH"
[[ "$(jq -r '.incident.status' "$HANDOFF_PATH")" == open ]] || fail "O handoff deveria retratar o incidente open"
[[ "$(jq -r '.severity.recommendedSeverity' "$HANDOFF_PATH")" == critica ]] || \
  fail "A severidade esperada para a indisponibilidade é critica"
for required_source in alert metrics logs; do
  jq -e --arg source "$required_source" \
    '.evidence.items | any(.source == $source)' \
    "$HANDOFF_PATH" >/dev/null || fail "O handoff não contém a fonte '$required_source'"
done
ok "Handoff preliminar gerado com alertas, métricas e logs"

CURRENT_STAGE="recuperação do serviço"
info "6/7 — Restaurando o serviço e esperando o resolved"
curl --fail --silent --show-error --request DELETE "$CHECKOUT_URL/control/failure" | jq .
FAILURE_ENABLED=false
wait_for_http "Health da checkout-api" 200 "$CHECKOUT_URL/health" 30
wait_for_incident_status "$INCIDENT_ID" awaiting_confirmation 150

CURRENT_STAGE="encerramento operacional"
info "7/7 — Confirmando o encerramento operacional"
closure_json="$(close_incident "$INCIDENT_ID")"
printf '%s\n' "$closure_json" | jq .
[[ "$(jq -r '.status' <<<"$closure_json")" == closed ]] || fail "O incidente deveria estar closed"

trap - ERR
printf '\n\033[1;32mFluxo principal validado.\033[0m\n'
printf 'Incidente: %s\n' "$INCIDENT_ID"
printf 'Handoff:   %s\n' "$HANDOFF_PATH"
printf '\nPróxima ação manual:\n'
printf '$incident-rca analise %s usando o checkout /caminho/para/o/repositorio e salve o RCA em Markdown\n' "$HANDOFF_PATH"
