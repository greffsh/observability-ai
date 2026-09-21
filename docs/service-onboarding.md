# Onboarding de serviços

Este guia descreve o processo completo para incluir um serviço no fluxo de
incidentes e RCA, desde a identidade OpenTelemetry até a publicação via CI/CD.
O resultado esperado é:

```text
serviço → OTLP → Alloy → Prometheus/Loki/Tempo → Grafana Alerting
        → Analyzer → handoff v2 → agente de RCA + repositório local
```

O Analyzer identifica um serviço pelo par canônico `service + environment` e
correlaciona somente ocorrências com o mesmo `incident_scope`. O mesmo par deve
estar presente na telemetria, nas regras do Grafana e no catálogo do Analyzer.

## 1. Definir a identidade canônica

Escolha antes da instrumentação:

| Campo                         | Exemplo                                | Regra                                                           |
| ----------------------------- | -------------------------------------- | --------------------------------------------------------------- |
| `service.name`                | `connect-api`                          | Estável entre deployments; não incluir hostname, pod ou versão. |
| `deployment.environment.name` | `hml`, `uat`, `pre`, `production`      | Usar exatamente o nome adotado no catálogo e nos alertas.       |
| `incident_scope`              | `http`                                 | Agrupar somente alertas que podem pertencer ao mesmo incidente. |
| URL do repositório            | `https://gitlab.example/grupo/servico` | URL estável, sem credenciais.                                   |

Não use branch, tag, pod ou image tag como identidade do serviço.

## 2. Registrar o perfil no Analyzer

Edite `infra/analyzer/service-catalog.json` e adicione o serviço e todos os
ambientes que poderão gerar incidentes. Alterações no catálogo exigem reiniciar
o Analyzer.

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

Antes do merge, valide o catálogo pelos testes do Analyzer:

```fish
cd services/analyzer
pnpm test
pnpm typecheck
```

## 3. Instrumentar o serviço

A stack local recebe OTLP por gRPC em `4317` e por HTTP em `4318`. O SDK deve
iniciar antes do framework HTTP e dos clientes instrumentados.

O contrato mínimo de resource attributes é:

```text
service.name=connect-api
deployment.environment.name=production
```

Chamadas entre serviços devem propagar W3C `traceparent`/`tracestate`. Headers
próprios podem existir por compatibilidade, mas não substituem o propagador
OpenTelemetry.

O Alloy normaliza `service.name` e `deployment.environment.name` para as labels
`service` e `environment`, encaminha logs ao Loki, métricas cumulativas ao
Prometheus e traces ao Tempo. Métricas OTLP delta não são aceitas pelo exporter
Prometheus estável usado nesta PoC; configure temporality cumulativa no SDK ou
converta antes do envio.

Exemplo genérico, sujeito ao suporte do SDK:

```text
OTEL_SERVICE_NAME=connect-api
OTEL_RESOURCE_ATTRIBUTES=deployment.environment.name=production
OTEL_EXPORTER_OTLP_ENDPOINT=http://HOST-DO-ALLOY:4318
```

As portas OTLP locais não possuem autenticação ou TLS. Em outro ambiente, use
um endpoint privado com autenticação, TLS e política de rede apropriada.

## 4. Publicar a proveniência da revisão

O handoff v2 identifica o código observado por estes atributos:

```text
service.version=<sha-completo>
vcs.ref.head.revision=<sha-completo>
vcs.ref.head.name=<branch-ou-tag>
vcs.ref.head.type=<branch-ou-tag>
vcs.repository.url.full=<url-do-repositório>
```

`vcs.ref.head.revision` é a autoridade. Branch e tag são informativas porque
refs são mutáveis. `service.version` é um fallback explícito e deve receber o
mesmo SHA completo quando possível.

O SHA identifica o snapshot completo do repositório, não apenas o diff do
último commit. Quando esse objeto existe no checkout fornecido ao RCA, o agente
pode ler todos os arquivos daquela revisão com operações Git read-only, sem
trocar a branch ativa.

Os atributos precisam ser definidos no processo que realmente emite a
telemetria. Labels de imagem e registros do GitLab são complementares, mas não
substituem os resource attributes do pod durante rolling deployments.

## 5. Integrar a proveniência ao CI/CD

### 5.1 Valores originados no pipeline da aplicação

Em GitLab CI, use os valores predefinidos:

| Dado                  | GitLab CI             |
| --------------------- | --------------------- |
| Revisão imutável      | `$CI_COMMIT_SHA`      |
| Branch ou tag         | `$CI_COMMIT_REF_NAME` |
| Tag, quando aplicável | `$CI_COMMIT_TAG`      |
| URL do repositório    | `$CI_PROJECT_URL`     |

Nunca derive a revisão apenas da image tag. Em produção, por exemplo, uma imagem
pode se chamar `v1.8.0`, mas `vcs.ref.head.revision` deve continuar recebendo o
SHA completo que produziu essa imagem.

Se uma imagem for promovida entre ambientes sem novo build, preserve o SHA do
build original. Não use o SHA do repositório GitOps ou de uma pipeline de
promoção como se fosse o SHA da aplicação.

### 5.2 Contrato recomendado para os jobs de deploy

O job de deploy deve entregar ao chart/manifests os quatro valores abaixo junto
com a imagem. Os nomes `DEPLOY_*` formam o contrato recomendado entre a pipeline
da aplicação e o template compartilhado de deploy:

```yaml
variables:
  DEPLOY_REVISION: "$CI_COMMIT_SHA"
  DEPLOY_REF_NAME: "$CI_COMMIT_REF_NAME"
  DEPLOY_REF_TYPE: "branch"
  DEPLOY_REPOSITORY_URL: "$CI_PROJECT_URL"
```

Para pipelines disparadas por tag:

```yaml
variables:
  DEPLOY_REVISION: "$CI_COMMIT_SHA"
  DEPLOY_REF_NAME: "$CI_COMMIT_TAG"
  DEPLOY_REF_TYPE: "tag"
  DEPLOY_REPOSITORY_URL: "$CI_PROJECT_URL"
```

Definir essas variáveis somente no job **não** as coloca automaticamente no pod.
O template de deploy deve gravá-las nos valores Helm ou no manifesto Kubernetes.
Essa atualização deve acontecer atomicamente com a image tag/digest.

### 5.3 Contrato dos valores Helm

O repositório de manifests deve representar a revisão separadamente da tag da
imagem:

```yaml
image:
  repository: registry.example/connect-api
  tag: v1.8.0

observability:
  serviceName: connect-api
  environment: production
  provenance:
    revision: 0123456789abcdef0123456789abcdef01234567
    refName: v1.8.0
    refType: tag
    repositoryUrl: https://gitlab.example/sancor/sancor-connect
```

O template do `Deployment` deve produzir um único valor sem quebras de linha:

```yaml
env:
  - name: OTEL_SERVICE_NAME
    value: "{{ .Values.observability.serviceName }}"
  - name: OTEL_RESOURCE_ATTRIBUTES
    value: "deployment.environment.name={{ .Values.observability.environment }},service.version={{ .Values.observability.provenance.revision }},vcs.ref.head.revision={{ .Values.observability.provenance.revision }},vcs.ref.head.name={{ .Values.observability.provenance.refName }},vcs.ref.head.type={{ .Values.observability.provenance.refType }},vcs.repository.url.full={{ .Values.observability.provenance.repositoryUrl }}"
```

Se o serviço já define `service.name` e ambiente no próprio SDK, preserve essa
configuração e acrescente somente os atributos de proveniência. Não mantenha duas
fontes divergentes para a mesma identidade.

No template compartilhado `.deploy-helm-v2`, a implementação esperada é:

1. receber `DEPLOY_REVISION`, `DEPLOY_REF_NAME`, `DEPLOY_REF_TYPE` e
   `DEPLOY_REPOSITORY_URL`;
2. atualizar esses campos no mesmo `REPO_VALUES` que recebe `IMAGE_TAG`;
3. aguardar ou verificar o rollout;
4. falhar se a revisão não chegar ao manifesto renderizado.

O template compartilhado não está neste repositório. Portanto, sua interface
deve ser verificada no projeto `plataforma-interna/pipelines-templates`. Se ele
ainda aceitar somente `IMAGE_TAG`, essa extensão é requisito do onboarding; não
considere concluído apenas por declarar `DEPLOY_*` no job consumidor.

### 5.4 Exemplo para os pipelines atuais do Connect

Nos jobs que estendem `.deploy-helm-v2`, acrescente os valores conforme a origem:

| Ambiente | Regra atual      | `DEPLOY_REF_NAME`     | `DEPLOY_REF_TYPE` | Imagem atual         |
| -------- | ---------------- | --------------------- | ----------------- | -------------------- |
| HML      | branch `homolog` | `$CI_COMMIT_REF_NAME` | `branch`          | `hml-$CI_COMMIT_SHA` |
| UAT      | branch `main`    | `$CI_COMMIT_REF_NAME` | `branch`          | `uat-$CI_COMMIT_SHA` |
| PRE      | tag              | `$CI_COMMIT_TAG`      | `tag`             | `pre-$CI_COMMIT_SHA` |
| Produção | tag/manual       | `$CI_COMMIT_TAG`      | `tag`             | `$CI_COMMIT_TAG`     |

Exemplo de job de branch:

```yaml
hml:deploy-connect-api:
  extends: .deploy-helm-v2
  variables:
    IMAGE_TAG: "hml-$CI_COMMIT_SHA"
    ENVIRONMENT: hml
    DEPLOY_REVISION: "$CI_COMMIT_SHA"
    DEPLOY_REF_NAME: "$CI_COMMIT_REF_NAME"
    DEPLOY_REF_TYPE: branch
    DEPLOY_REPOSITORY_URL: "$CI_PROJECT_URL"
```

Exemplo de produção por tag:

```yaml
prod:deploy-connect-api:
  extends: .deploy-helm-v2
  variables:
    IMAGE_TAG: "$CI_COMMIT_TAG"
    ENVIRONMENT: production
    DEPLOY_REVISION: "$CI_COMMIT_SHA"
    DEPLOY_REF_NAME: "$CI_COMMIT_TAG"
    DEPLOY_REF_TYPE: tag
    DEPLOY_REPOSITORY_URL: "$CI_PROJECT_URL"
```

As `rules:changes` dos jobs de build e deploy também devem incluir tudo que pode
alterar a imagem ou a instrumentação, como `Dockerfile`, manifests auxiliares,
`package.json`, lockfile e configuração OpenTelemetry. Caso contrário, uma
mudança nesses arquivos pode não produzir novo deployment.

### 5.5 Registrar o deployment no GitLab

Além da telemetria por instância, configure o job de deploy com o environment do
GitLab, diretamente ou pelo template compartilhado:

```yaml
environment:
  name: production
```

Isso habilita histórico e API de deployments com SHA, ref, status e timestamps.
Esse registro serve para auditoria da pipeline, mas não prova sozinho qual pod
atendeu uma requisição durante um rollout; `target_info` continua sendo a fonte
do handoff para essa correspondência.

### 5.6 Rollback

Rollback deve restaurar imagem e proveniência juntas. Se a imagem voltar ao
commit `A`, o pod também deve publicar `revision=A`, ainda que o rollback seja
executado por uma pipeline cujo próprio commit seja `B`.

A forma mais segura é manter revisão/ref/URL junto aos metadados da imagem ou no
registro versionado de release usado pelo job de rollback.

## 6. Configurar o alerta

O contact point do Grafana pode ser compartilhado. Cada regra precisa fornecer:

```yaml
labels:
  service: connect-api
  environment: production
  incident_scope: http
```

`incident_scope` reúne sinais semanticamente compatíveis, como taxa de erros e
indisponibilidade HTTP. Quando ausente ou vazio, o Analyzer usa `alertname` como
fallback conservador; alertas diferentes não são unidos apenas porque pertencem
ao mesmo serviço e ambiente.

Um serviço sem perfil ou sem métricas suficientes ainda pode gerar incidente,
mas sua severidade ficará explicitamente inconclusiva.

## 7. Validar depois do deployment

### 7.1 Confirmar o ambiente do processo

Verifique no pod que `OTEL_RESOURCE_ATTRIBUTES` chegou sem quebras de linha. Não
imprima variáveis que contenham credenciais; os atributos de proveniência não
devem conter segredos.

Exemplo Kubernetes:

```fish
set namespace meu-namespace
set deployment meu-deployment
kubectl --namespace $namespace get deployment $deployment \
  --output 'jsonpath={.spec.template.spec.containers[0].env[?(@.name=="OTEL_RESOURCE_ATTRIBUTES")].value}{"\n"}'
```

### 7.2 Confirmar o Prometheus

Aguarde ao menos um intervalo de exportação e consulte:

```fish
curl --get http://localhost:9090/api/v1/query \
  --data-urlencode 'query=target_info{job="connect-api",deployment_environment_name="production"}' \
  | jq '.data.result[].metric | {
      service_version,
      vcs_ref_head_revision,
      vcs_ref_head_name,
      vcs_ref_head_type,
      vcs_repository_url_full
    }'
```

Prometheus converte pontos dos nomes OpenTelemetry em underscores. O resultado
deve conter o SHA completo implantado. Durante rolling deployment, duas revisões
simultâneas são esperadas e o handoff deve classificá-las como
`multiple_revisions`, não escolher uma arbitrariamente.

### 7.3 Confirmar logs e traces

Produza uma requisição conhecida e confirme:

- log consultável por `service + environment` no Loki;
- trace com span de servidor no Tempo;
- propagação W3C nas chamadas downstream;
- ausência de corpos, tokens ou dados pessoais exportados sem allowlist.

### 7.4 Confirmar alerta, incidente e handoff

Produza uma falha controlada, aguarde o alerta e exporte o handoff. Verifique:

```fish
jq '{
  schemaVersion,
  deploymentContext,
  evidence: [.evidence.items[] | {id, source}]
}' rca-handoff.json
```

Critérios mínimos:

- `schemaVersion` igual a `2`;
- `deploymentContext.status` igual a `observed`;
- revisão igual ao SHA da imagem/release;
- item de evidência `deployment-1`;
- evidências de impacto adequadas ao serviço;
- checkout correto classificado como `exact` pelo validador da skill.

## 8. Fornecer o repositório para o RCA

O Analyzer não clona nem acessa repositórios. O operador fornece separadamente
o handoff — ou o ID do incidente — e um checkout local do repositório correto:

```text
$incident-rca analise o incidente <UUID> usando o checkout
/caminho/para/o/servico
```

A skill compara o HEAD com a revisão observada. Se houver uma única revisão e o
commit existir no banco de objetos local, ela analisa diretamente esse snapshot,
mesmo que outra branch esteja ativa. Ela não faz fetch nem troca o working tree.

O contrato e o procedimento de exportação estão em
[rca-handoff.md](rca-handoff.md).

## Checklist de aceite

- [ ] Identidade `service + environment` definida e consistente.
- [ ] Perfil incluído e testado no catálogo do Analyzer.
- [ ] SDK iniciado antes do framework e exportando OTLP.
- [ ] Métricas cumulativas, logs sanitizados e traces W3C confirmados.
- [ ] Build associado ao SHA completo da aplicação.
- [ ] Deploy injeta revisão, ref e URL no pod, não apenas no job CI.
- [ ] Image tag/digest e proveniência são atualizados atomicamente.
- [ ] Job aparece no environment/deployment history do GitLab.
- [ ] `target_info` contém `service_version` e labels `vcs_*`.
- [ ] Rolling deployment e rollback preservam a revisão correta.
- [ ] Regra Grafana envia `service`, `environment` e `incident_scope`.
- [ ] Incidente e handoff v2 foram exercitados ponta a ponta.
- [ ] RCA consegue classificar e ler a revisão observada no repositório local.
