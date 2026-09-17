# Onboarding de serviços

O Analyzer identifica um serviço pelo par canônico `service + environment` e
correlaciona somente ocorrências com o mesmo `incident_scope`. O mesmo par
precisa chegar nos alertas do Grafana e estar disponível como labels
consultáveis nos logs. Métricas específicas são traduzidas em sinais de impacto
por um perfil versionado.

## 1. Registrar o perfil

Edite `infra/analyzer/service-catalog.json` e adicione o serviço. Alterações no
catálogo exigem reiniciar o Analyzer.

```json
{
  "connect-api": {
    "criticality": "high",
    "environments": {
      "production": {
        "severityCeiling": "critica",
        "impactQueries": {
          "totalRequests": "http_server_requests_total{service=\"{{service}}\",environment=\"{{environment}}\"}",
          "failedRequests": "http_server_requests_total{service=\"{{service}}\",environment=\"{{environment}}\",outcome=\"failure\"}",
          "availability": "connect_up{service=\"{{service}}\",environment=\"{{environment}}\"}"
        }
      }
    }
  }
}
```

As consultas opcionais reconhecidas são `totalRequests`, `failedRequests`,
`failureState`, `availability` e `lastChange`. Os placeholders `{{service}}` e
`{{environment}}` são substituídos pela identidade sanitizada do incidente.

## 2. Enviar telemetria OpenTelemetry

A stack local recebe OTLP por gRPC em `4317` e por HTTP em `4318`. Um serviço
instrumentado deve enviar os resource attributes:

```text
service.name=connect-api
deployment.environment.name=production
```

O Alloy os normaliza para `service` e `environment`, envia logs ao Loki,
métricas cumulativas ao Prometheus e traces ao Tempo. Métricas OTLP delta não
são aceitas pelo exporter Prometheus estável usado nesta PoC e devem ser
convertidas antes do envio ou configuradas como cumulativas no SDK/Collector de
origem.

Exemplo de configuração, sujeito ao suporte do SDK da linguagem:

```text
OTEL_SERVICE_NAME=connect-api
OTEL_RESOURCE_ATTRIBUTES=deployment.environment.name=production
OTEL_EXPORTER_OTLP_ENDPOINT=http://HOST-DO-ALLOY:4318
```

O SDK precisa iniciar antes do framework HTTP e dos clientes instrumentados.
Chamadas entre serviços devem propagar W3C `traceparent`/`tracestate`; headers
próprios podem existir por compatibilidade, mas não substituem o propagador
OpenTelemetry. Para o handoff, o Analyzer seleciona apenas traces que contenham
span de servidor do serviço do incidente e aplica limites de quantidade, bytes
e atributos.

As portas OTLP desta stack não possuem autenticação ou TLS e são adequadas
somente para localhost ou rede privada de desenvolvimento. Não as exponha
diretamente à internet.

## 3. Configurar o alerta

O contact point do Grafana pode ser compartilhado entre serviços. Cada regra
que representa um sinal do Connect precisa enviar pelo menos:

```yaml
labels:
  service: connect-api
  environment: production
  incident_scope: http
```

`incident_scope` reúne sinais semanticamente compatíveis, como taxa de erros e
indisponibilidade HTTP. Quando a label estiver ausente ou vazia, o Analyzer usa
o `alertname` como fallback conservador; alertas diferentes não são unidos só
porque pertencem ao mesmo serviço e ambiente.

O Analyzer aceita o webhook, cria eventos, ocorrências e incidentes, consulta o
perfil correspondente e coleta o contexto disponível. Um serviço sem perfil ou
sem métricas suficientes continua gerando incidente, mas sua severidade fica
explicitamente inconclusiva.

## 4. Fornecer o repositório para o RCA

O repositório não faz parte do perfil. No handoff manual do RCA, o operador
fornece separadamente o contexto do incidente e o checkout local:

```text
incident_context=./incident.json
repository_path=/caminho/para/connect
```

O contexto pode ser gerado pelo endpoint de exportação descrito em
[rca-handoff.md](rca-handoff.md). O checkout nunca é inferido do perfil do
serviço nem incluído pelo Analyzer no pacote.
