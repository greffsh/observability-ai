# Contratos das fontes de evidência do CP-07

Pesquisa realizada em 2026-08-31 para orientar os adapters read-only de Prometheus, Loki, GitHub e GitLab. Foram usadas somente fontes oficiais.

## Resumo das decisões recomendadas

1. Consultar métricas e logs com `start` e `end` explícitos, janela curta e limites locais de séries, entradas e bytes; a fronteira final é inclusiva no Prometheus e exclusiva no Loki. [Prometheus HTTP API](https://prometheus.io/docs/prometheus/latest/querying/api/) e [Loki HTTP API](https://grafana.com/docs/loki/latest/reference/loki-http-api/)
2. Construir PromQL e LogQL com parâmetros codificados, sem interpolação manual: usar `POST application/x-www-form-urlencoded` para PromQL grande e `GET` com query string codificada para o contrato documentado do Loki. [Prometheus HTTP API](https://prometheus.io/docs/prometheus/latest/querying/api/) e [Loki HTTP API](https://grafana.com/docs/loki/latest/reference/loki-http-api/)
3. Buscar código somente em um SHA completo de commit e persistir separadamente o identificador da revisão e um permalink humano para o mesmo commit, arquivo e intervalo de linhas. Branches podem mudar; GitHub e GitLab documentam permalinks fixados à revisão. [Permalinks do GitHub](https://docs.github.com/en/repositories/working-with-files/using-files/getting-permanent-links-to-files) e [permalinks do GitLab](https://docs.gitlab.com/user/project/repository/files/#create-permalinks)
4. Tratar indisponibilidade, timeout, limite excedido e resposta parcial como estado da fonte no pacote, preservando as demais evidências. Essa é uma recomendação de desenho derivada dos envelopes de erro, warnings e limites configuráveis das APIs descritos abaixo.

## Prometheus: consulta de métricas

### Requisição

`GET|POST /api/v1/query_range` exige `query`, `start`, `end` e `step`; aceita opcionalmente `timeout` e `limit`. `start` e `end` aceitam RFC3339 ou Unix em segundos, inclusive frações, e ambos são inclusivos. `step` aceita duração ou segundos; `limit` restringe o número de séries retornadas, não os pontos de cada série. [Prometheus HTTP API](https://prometheus.io/docs/prometheus/latest/querying/api/#range-queries)

No `POST`, os parâmetros continuam sendo form data codificado com `Content-Type: application/x-www-form-urlencoded`; a documentação recomenda essa forma para consultas que possam exceder o limite de tamanho da URL. Expressões e seletores devem ser URL-encoded. [Prometheus HTTP API](https://prometheus.io/docs/prometheus/latest/querying/api/)

Exemplo de forma, não de consulta fixa:

```http
POST /api/v1/query_range
Content-Type: application/x-www-form-urlencoded

query=<promql>&start=<unix-seconds>&end=<unix-seconds>&step=15s&timeout=10s&limit=100
```

### Resposta e falhas

O sucesso tem envelope `{"status":"success","data":{"resultType":"matrix","result":[...]}}`; cada elemento de `result` contém labels em `metric` e amostras `values` no formato `[timestamp_em_segundos, valor_como_string]`. A resposta pode trazer `warnings` e `infos` junto com dados aproveitáveis. [Prometheus HTTP API](https://prometheus.io/docs/prometheus/latest/querying/api/#format-overview)

Erros da API usam `status: "error"`, `errorType` e `error`; os códigos documentados são `400` para parâmetros inválidos, `422` para expressão não executável e `503` para consulta abortada ou expirada. [Prometheus HTTP API](https://prometheus.io/docs/prometheus/latest/querying/api/#format-overview)

O `timeout` pedido pelo cliente é limitado por `--query.timeout`; concorrência e amostras carregadas também possuem limites configuráveis no servidor. Portanto, o adapter não deve inferir completude apenas de HTTP `2xx`: deve preservar `warnings`/`infos` e impor seus próprios limites de pontos e bytes. [Parâmetros do Prometheus](https://prometheus.io/docs/prometheus/latest/command-line/prometheus/)

Prometheus pode proteger UI e HTTP API com Basic Auth, TLS e mTLS por `--web.config.file`; o adapter deve tornar essa autenticação configurável sem assumir que todo deployment a exige. [HTTPS e autenticação do Prometheus](https://prometheus.io/docs/prometheus/latest/configuration/https/)

## Loki: consulta de logs e métricas LogQL

### Requisição

O contrato documentado é `GET /loki/api/v1/query_range`. `query` define a expressão LogQL; `limit` vale para logs e tem default `100`; `start` é inclusivo; `end` é exclusivo; sem janela explícita, os defaults são uma hora atrás e agora. Também existem `since`, `step`, `interval` e `direction`, cujo default é `backward`. [Loki HTTP API](https://grafana.com/docs/loki/latest/reference/loki-http-api/#query-logs-within-a-range-of-time)

Timestamps aceitam epoch em nanossegundos, segundos decimais ou RFC3339/RFC3339Nano. `start` prevalece sobre `since`; `step` é a resolução de consultas métricas que retornam `matrix`, enquanto `interval` reduz entradas de consultas de logs que retornam `streams`, sem preencher lacunas. [Loki HTTP API](https://grafana.com/docs/loki/latest/reference/loki-http-api/#step-versus-interval)

Os exemplos oficiais usam `curl -G --data-urlencode`; a implementação equivalente deve montar os parâmetros com um encoder de URL, especialmente porque LogQL contém chaves, aspas, operadores e espaços. [Loki HTTP API](https://grafana.com/docs/loki/latest/reference/loki-http-api/#examples-2)

### Resposta e limites

O sucesso retorna `status`, `data.resultType`, `data.result` e `data.stats`. Para `streams`, cada item contém labels em `stream` e pares `[timestamp_epoch_ns_como_string, linha]`; para `matrix`, contém labels em `metric` e pares `[timestamp_em_segundos, valor_como_string]`. A ordem dos logs segue `direction`. [Loki HTTP API](https://grafana.com/docs/loki/latest/reference/loki-http-api/#query-logs-within-a-range-of-time)

Os limites são configuração do deployment, não garantias do cliente. A referência atual documenta defaults de `1m` para `query_timeout`, `5.000` entradas por consulta de logs e `500` séries por consulta métrica; o operador pode alterá-los. O adapter deve definir `limit`, prazo HTTP e teto local de bytes menores que seu orçamento total, e registrar truncamento ou timeout como limitação da fonte. [Configuração do Loki](https://grafana.com/docs/loki/latest/configure/)

Loki OSS não inclui uma camada de autenticação e a documentação orienta colocar um proxy autenticador à frente. Com multi-tenancy habilitado, `X-Scope-OrgID` identifica o tenant e sua ausência resulta em `401`; com `auth_enabled: false`, o header não é necessário. O identificador do tenant não substitui autenticação. [Autenticação do Loki](https://grafana.com/docs/loki/latest/operations/authentication/) e [multi-tenancy do Loki](https://grafana.com/docs/loki/latest/operations/multi-tenancy/)

## GitHub: arquivo em commit exato

`GET /repos/{owner}/{repo}/contents/{path}?ref={commit_sha}` recupera um arquivo na revisão indicada por `ref`. A resposta JSON de arquivo inclui `content` em Base64, `encoding`, `sha` do blob, `size`, `path`, `html_url` e `download_url`; o media type `application/vnd.github.raw+json` pode retornar o conteúdo bruto. [Repository contents API](https://docs.github.com/en/rest/repos/contents#get-repository-content)

Para repositórios privados, tokens fine-grained precisam somente da permissão de repositório `Contents: read` e são enviados como `Authorization: Bearer`; recursos públicos podem ser consultados sem autenticação. O endpoint suporta arquivos de até 100 MB, com restrições de media type acima de 1 MB, e `download_url` expira, portanto não deve ser armazenada como referência durável. [Repository contents API](https://docs.github.com/en/rest/repos/contents#get-repository-content)

Como recomendação de implementação, montar a URL com um construtor, codificando `owner`, `repo`, cada segmento de `path` e `ref` sem permitir que dados de configuração alterem host ou rota. O contrato oficial define esses valores como parâmetros separados. [Repository contents API](https://docs.github.com/en/rest/repos/contents#get-repository-content)

Referência humana estável:

```text
https://github.com/{owner}/{repo}/blob/{commit_sha}/{path}#L{start}-L{end}
```

O GitHub documenta que substituir a branch por um commit ID fixa a versão e permite permalinks para uma linha ou intervalo; para Markdown em modo fonte, usa-se `?plain=1#L{line}`. [Permalinks para arquivos](https://docs.github.com/en/repositories/working-with-files/using-files/getting-permanent-links-to-files) e [permalinks para trechos](https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/creating-a-permanent-link-to-a-code-snippet)

## GitLab: arquivo em commit exato

`GET /projects/{id}/repository/files/{file_path}?ref={commit_sha}` exige `id` do projeto ou path do projeto URL-encoded, `file_path` completo URL-encoded e `ref`, que pode ser commit. O sucesso inclui `content` em Base64, `content_sha256`, `blob_id`, `commit_id`, `last_commit_id`, `file_path`, `size` e `encoding`; o endpoint alternativo terminado em `/raw` devolve o conteúdo bruto. [Repository files API](https://docs.gitlab.com/api/repository_files/#retrieve-a-file-from-a-repository)

Tokens pessoais aceitos para leitura podem usar `read_repository` ou `read_api` e os exemplos oficiais usam o header `PRIVATE-TOKEN`; repositórios públicos não exigem autenticação. Arquivos acima de 10 MB têm limite documentado de cinco requisições por minuto nesse endpoint. [Repository files API](https://docs.gitlab.com/api/repository_files/)

Referência humana estável:

```text
https://gitlab.example.com/{namespace}/{project}/-/blob/{commit_sha}/{path}#L{start}-{end}
```

O GitLab define permalinks como URLs que continuam válidas quando o repositório muda e permite copiar um permalink de uma linha ou seleção; seu guia oficial também mostra o formato `/-/blob/{commit}/{path}#L3` e recomenda commit no lugar da branch. [Permalinks do GitLab](https://docs.gitlab.com/user/project/repository/files/#create-permalinks) e [guia de links para linhas](https://docs.gitlab.com/development/documentation/styleguide/#link-to-specific-lines-of-code)

## Contrato recomendado para o pacote

As recomendações abaixo são inferências de engenharia para satisfazer a auditabilidade do CP-07, baseadas nos contratos oficiais acima:

- manter por consulta `source`, `query`, `window.start`, `window.end`, `fetched_at`, duração, status e eventual limitação sanitizada;
- manter dados numéricos como strings durante o parse quando a API assim os fornece, em especial epoch-ns do Loki, evitando perda de precisão antes da normalização; [Loki HTTP API](https://grafana.com/docs/loki/latest/reference/loki-http-api/#query-logs-within-a-range-of-time)
- distinguir `complete`, `partial`, `unavailable`, `timed_out` e `truncated`; resultado vazio é uma coleta bem-sucedida, não indisponibilidade;
- guardar evidência de código com provedor, host, repositório/projeto, SHA completo do commit, path, linhas inicial/final, hash do conteúdo e permalink construído para o mesmo SHA; [Permalinks do GitHub](https://docs.github.com/en/repositories/working-with-files/using-files/getting-permanent-links-to-files) e [permalinks do GitLab](https://docs.gitlab.com/user/project/repository/files/#create-permalinks)
- nunca persistir token, header de autenticação, URL temporária de download ou mensagem remota sem sanitização;
- aplicar timeout do cliente abaixo do orçamento global do Analyzer e retries curtos somente após classificar a falha como transitória; não repetir automaticamente erros determinísticos de contrato como `400`/`422`; [Prometheus HTTP API](https://prometheus.io/docs/prometheus/latest/querying/api/#format-overview)
- limitar previamente janela e seletor, depois limitar quantidade e bytes localmente; limites do servidor podem variar por deployment e não substituem os limites do pacote. [Parâmetros do Prometheus](https://prometheus.io/docs/prometheus/latest/command-line/prometheus/) e [configuração do Loki](https://grafana.com/docs/loki/latest/configure/)
