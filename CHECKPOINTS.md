# PoC de RCA assistido por IA — fonte da verdade

> Documento vivo de requisitos, decisões e progresso da PoC.
>
> Última atualização: 2026-08-27

Considerações específicas para uma implantação futura são mantidas em
`HOMOLOGACAO.md`; decisões que alterem a PoC continuam sendo registradas neste
arquivo.

## Como manter este documento

- Este arquivo é a fonte da verdade do projeto. Mudanças de escopo, decisões técnicas e conclusões de checkpoints devem ser registradas aqui.
- Um checkpoint só recebe o estado `CONCLUÍDO` quando todos os seus critérios de aceite estiverem atendidos e houver evidência verificável.
- Decisões ainda não tomadas permanecem como `PENDENTE`; não devem ser incorporadas silenciosamente à implementação.
- Se um requisito mudar, registrar a alteração no histórico de decisões e ajustar os checkpoints afetados.
- Cada checkpoint deve terminar com a atualização deste arquivo, incluindo links para código, testes, documentação ou capturas relevantes.

### Estados

- `PENDENTE`: ainda não iniciado.
- `EM ANDAMENTO`: implementação ou auditoria em curso.
- `BLOQUEADO`: depende de uma decisão ou condição explicitamente registrada.
- `CONCLUÍDO`: critérios de aceite atendidos e evidências registradas.
- `DESCARTADO`: retirado do escopo com justificativa registrada.

## Visão do produto

Construir uma PoC que receba sinais de observabilidade do Grafana, reúna contexto técnico, classifique o possível incidente e produza um RCA assistido por IA com evidências. A conclusão será enviada ao canal adequado conforme uma política de roteamento, mantendo a decisão final sob responsabilidade humana.

```text
Grafana -> Ingestão -> Contexto -> Analyzer -> Política -> Notificação
                |                       |
                +---- persistência -----+
```

Princípio central:

1. O Grafana detecta.
2. O Analyzer explica e recomenda uma classificação.
3. Uma política determina o encaminhamento.
4. Uma pessoa decide e corrige quando necessário.

## Objetivos da PoC

- Demonstrar o fluxo completo entre a detecção de um problema e a entrega de uma análise acionável.
- Verificar se logs, métricas e outros sinais disponíveis fornecem contexto suficiente para hipóteses úteis.
- Garantir que as conclusões do Analyzer sejam acompanhadas por evidências verificáveis.
- Avaliar qualidade, latência e custo das análises.
- Reduzir ruído por meio de correlação e deduplicação de alertas.
- Permitir auditoria das entradas, decisões, saídas e ações humanas.

## Fora do escopo inicial

- Diagnóstico autônomo tratado como verdade definitiva.
- Correção automática ou execução automática de rollback.
- Hub completo com interface final, login e controle de papéis.
- Integração definitiva com todos os portais e canais corporativos.
- Cobertura de todos os serviços e todos os tipos de incidente.
- Alta disponibilidade e escala de produção.

Esses itens podem ser promovidos ao escopo após a validação do núcleo da PoC.

## Requisitos

### Requisitos funcionais

| ID    | Requisito                                                                                        |  Prioridade | Estado   |
| ----- | ------------------------------------------------------------------------------------------------ | ----------: | -------- |
| RF-01 | Receber eventos de alerta do Grafana por webhook.                                                | Obrigatório | PENDENTE |
| RF-02 | Validar e normalizar o evento recebido em um contrato interno versionado.                        | Obrigatório | PENDENTE |
| RF-03 | Identificar ambiente, serviço e alerta sem misturar incidentes distintos.                        | Obrigatório | PENDENTE |
| RF-04 | Correlacionar e deduplicar ocorrências repetidas do mesmo incidente.                             | Obrigatório | PENDENTE |
| RF-05 | Tratar pelo menos os estados de alerta ativo e resolvido.                                        | Obrigatório | PENDENTE |
| RF-06 | Buscar contexto técnico relacionado ao alerta, inicialmente em logs e métricas.                  | Obrigatório | PENDENTE |
| RF-07 | Preservar referência consultável para cada evidência usada na análise.                           | Obrigatório | PENDENTE |
| RF-08 | Produzir resumo, impacto, causa provável, alternativas, confiança e ações sugeridas.             | Obrigatório | PENDENTE |
| RF-09 | Declarar contexto insuficiente quando não houver evidência para uma conclusão responsável.       | Obrigatório | PENDENTE |
| RF-10 | Recomendar uma classificação de severidade com justificativa.                                    | Obrigatório | PENDENTE |
| RF-11 | Aplicar regras configuráveis de roteamento sem delegar a decisão final exclusivamente ao modelo. | Obrigatório | PENDENTE |
| RF-12 | Enviar a análise para pelo menos um destino de notificação.                                      | Obrigatório | PENDENTE |
| RF-13 | Persistir incidente, eventos correlacionados, evidências, análise e resultado do envio.          | Obrigatório | PENDENTE |
| RF-14 | Registrar modelo utilizado, consumo de tokens, duração e custo estimado da análise.              |   Desejável | PENDENTE |
| RF-15 | Permitir reanalisar um incidente de forma controlada.                                            |   Desejável | PENDENTE |
| RF-16 | Registrar feedback humano sobre severidade e utilidade do RCA.                                   |   Desejável | PENDENTE |

### Requisitos não funcionais

| ID     | Requisito                           | Critério inicial                                                                                | Estado   |
| ------ | ----------------------------------- | ----------------------------------------------------------------------------------------------- | -------- |
| RNF-01 | Rastreabilidade                     | Toda afirmação factual relevante deve apontar para uma evidência ou ser marcada como hipótese.  | PENDENTE |
| RNF-02 | Idempotência                        | Reenvio do mesmo evento não pode criar incidentes ou notificações indevidas.                    | PENDENTE |
| RNF-03 | Segurança                           | Segredos não podem estar no código, payload de saída ou logs da aplicação.                      | PENDENTE |
| RNF-04 | Privacidade                         | Dados sensíveis devem ser identificados e removidos ou mascarados antes do envio ao modelo.     | PENDENTE |
| RNF-05 | Resistência a entrada não confiável | Conteúdo de logs não pode alterar instruções ou política do Analyzer.                           | PENDENTE |
| RNF-06 | Observabilidade                     | Cada execução deve possuir identificador correlacionável e logs estruturados.                   | PENDENTE |
| RNF-07 | Reprodutibilidade                   | O ambiente local deve subir a partir de instruções versionadas.                                 | PENDENTE |
| RNF-08 | Testabilidade                       | Regras de correlação, severidade e roteamento devem ser testáveis sem chamar um modelo real.    | PENDENTE |
| RNF-09 | Degradação segura                   | Falhas em fontes de contexto ou no modelo devem gerar estado explícito, sem inventar conclusão. | PENDENTE |
| RNF-10 | Auditabilidade                      | Deve ser possível reconstruir por que uma classificação e uma notificação ocorreram.            | PENDENTE |

## Contrato mínimo do RCA

Toda análise deve produzir uma estrutura equivalente a:

```yaml
incident_id: identificador interno
summary: resumo curto do ocorrido
recommended_severity: informativa | baixa | media | alta | critica | inconclusiva
confidence: 0.0 a 1.0
observed_impact: impacto comprovado pelos sinais disponíveis
probable_cause: hipótese principal ou contexto insuficiente
alternative_hypotheses: []
evidence:
  - source: logs | metrics | traces | deployment | alert
    description: o que foi observado
    reference: link ou identificador consultável
suggested_actions: []
limitations: []
```

O formato definitivo e os nomes dos campos ainda serão decididos, mas essas informações são obrigatórias para a PoC.

## Decisões técnicas pendentes

| ID    | Decisão                                     | Opções iniciais                                            | Necessária antes de       | Estado   |
| ----- | ------------------------------------------- | ---------------------------------------------------------- | ------------------------- | -------- |
| DT-01 | Papel do n8n                                | Removido do escopo inicial                                 | CP-04                     | DECIDIDO |
| DT-02 | Linguagem do Analyzer                       | TypeScript                                                 | CP-04                     | DECIDIDO |
| DT-03 | Banco da PoC                                | PostgreSQL                                                 | CP-05                     | DECIDIDO |
| DT-04 | Fontes de observabilidade locais            | Logs + métricas; traces adiados                            | CP-03                     | DECIDIDO |
| DT-05 | Provedor e modelo de IA                     | A definir                                                  | CP-09                     | PENDENTE |
| DT-06 | Estratégia de acesso ao modelo              | API direta; gateway interno; abstração própria             | CP-09                     | PENDENTE |
| DT-07 | Canal inicial de notificação                | Webhook local enviado diretamente pelo Analyzer            | CP-11                     | DECIDIDO |
| DT-08 | Taxonomia de severidade                     | Cinco níveis propostos; taxonomia existente da organização | CP-08                     | PENDENTE |
| DT-09 | Metadados de criticidade dos serviços       | Arquivo versionado; catálogo; labels do Grafana            | CP-08                     | PENDENTE |
| DT-10 | Política de retenção de payloads e análises | A definir                                                  | Antes de usar dados reais | PENDENTE |
| DT-11 | Framework do Analyzer                       | Effect estável com adoção controlada                       | CP-04                     | DECIDIDO |
| DT-12 | Framework HTTP                              | Fastify nas aplicações TypeScript                          | CP-03                     | DECIDIDO |

## Inventário preliminar de contas e credenciais

| Componente | Conta externa necessária na PoC | Segredo ou identidade local | Observação |
|---|---|---|---|
| Docker / Docker Compose | Não | Nenhum | Imagens públicas e ambiente executado localmente. |
| Grafana OSS | Não | Usuário e senha de administrador local | Não confundir com uma conta Grafana Cloud, que não é necessária. |
| Webhook Grafana → Analyzer | Não | Segredo compartilhado para autenticar o webhook | Deve ser diferente das credenciais administrativas do Grafana. |
| Prometheus | Não | Nenhum no ambiente local isolado | Acesso restrito à rede interna do Compose. |
| Loki | Não | Nenhum nativo na configuração local proposta | Não expor publicamente; Loki não fornece camada de autenticação embutida. |
| Grafana Alloy | Não | Nenhum | Permissões de coleta devem ser limitadas às fontes necessárias. |
| PostgreSQL | Não | Usuário e senha próprios do Analyzer | Segredos locais gerados para a PoC e não versionados. |
| Analyzer | Não | Segredo interno para chamadas recebidas | Credencial do provedor de IA é injetada somente no Analyzer. |
| Provedor de IA externo | Sim, quando a chamada real for habilitada | Chave de API restrita ao projeto da PoC | Provedor e modelo ainda pendentes em DT-05 e DT-06. |
| Canal de chat corporativo | Não no primeiro corte | Futuramente, webhook ou credencial de bot | O primeiro destino será um receptor local. |

Os nomes dos segredos serão definidos no CP-02 e documentados em `.env.example` sem valores reais. Nenhuma chave administrativa de organização deve ser utilizada em tempo de execução quando uma chave restrita ao projeto for suficiente.

## Checkpoints

### CP-00 — Confirmar escopo e critérios de sucesso

**Estado:** `CONCLUÍDO`

**Objetivo:** transformar a proposta em hipóteses mensuráveis para evitar que a PoC seja avaliada apenas pela aparência da demonstração.

**Entregáveis:**

- três cenários de incidente descritos, com entrada e resultado esperado;
- definição do que caracteriza uma análise útil;
- limites iniciais aceitáveis de latência e custo;
- definição de quem audita a severidade e o RCA.

**Critérios de aceite:**

- [x] Os três cenários estão registrados neste documento.
- [x] Cada cenário possui resultado esperado e sinais disponíveis.
- [x] As métricas de avaliação têm valores-alvo ou estão explicitamente marcadas para medição exploratória.

**Evidências:** cenários CV-01, CV-02 e CV-03; métricas desta seção; DEC-001.

**Critérios confirmados:**

- considerar uma análise útil quando ela identifica corretamente o impacto observado, separa fatos de hipóteses, cita evidências consultáveis e sugere ao menos uma próxima ação segura;
- exigir que os três cenários controlados percorram o fluxo completo sem intervenção manual entre o alerta e a notificação;
- exigir classificação compatível com o resultado esperado nos três cenários controlados;
- exigir que eventos duplicados resultem em um único incidente e não gerem notificações repetidas;
- usar inicialmente `até 120 segundos` como alvo exploratório entre o recebimento do webhook e a entrega da notificação;
- medir separadamente o tempo entre o início da falha e o disparo do alerta, pois ele depende da regra e da frequência de avaliação configuradas no Grafana;
- medir custo por análise durante a PoC, sem fixar um teto antes de escolher o modelo e observar a quantidade real de contexto;
- registrar avaliação humana de `1 a 5` para utilidade, correção da severidade e qualidade das evidências, buscando nota mínima `4` em utilidade em pelo menos dois dos três cenários;
- usar o responsável técnico pela PoC como auditor dos checkpoints; a validação por uma pessoa com experiência operacional não está disponível nesta fase e será registrada como limitação.

**Decisões confirmadas:** aplicação genérica de demonstração, auditoria inicial pelo responsável técnico e alvo exploratório de 120 segundos.

---

### CP-01 — Definir arquitetura mínima e responsabilidades

**Estado:** `CONCLUÍDO`

**Objetivo:** definir os componentes da PoC e evitar lógica distribuída sem responsabilidade clara.

**Entregáveis:**

- diagrama da arquitetura aprovada;
- responsabilidade de Grafana, n8n, Analyzer, banco e fontes de contexto;
- decisão DT-01 sobre o papel do n8n;
- limites do que não será construído nesta fase.

**Critérios de aceite:**

- [x] Cada responsabilidade pertence a um componente definido.
- [x] O Analyzer pode ser testado independentemente do Grafana e do canal de notificação.
- [x] A decisão sobre n8n e sua justificativa estão registradas.

**Evidências:** diagrama e responsabilidades desta seção; DEC-002 e DEC-003.

**Proposta de arquitetura em discussão:**

```text
checkout-api ── métricas ──> Prometheus ──┐
     │                                     │
     └──── logs ──> Alloy ──> Loki ───────┼──> Grafana Alerting
                                           │          │ webhook
                                           │          v
                                           └────> Analyzer
                                           │
                                           ├── consulta Prometheus e Loki
                                           ├── chama o provedor de IA
                                           ├── persiste no PostgreSQL
                                           └── notifica por um adaptador
                                                      │
                                                      v
                                         receptor local de notificações
```

**Componentes propostos:**

- Docker Compose para o ambiente local;
- Grafana OSS com configuração provisionada em arquivos;
- Prometheus para métricas;
- Loki para logs;
- Grafana Alloy para coleta e encaminhamento dos logs;
- Analyzer como aplicação independente, com interface própria para o provedor de IA;
- PostgreSQL como persistência e fila durável inicial do Analyzer;
- aplicação genérica `checkout-api` com modos de falha controlados;
- receptor local de webhook como destino inicial, sem integração externa;
- sem Redis, fila dedicada, Tempo, Hub ou canal corporativo neste primeiro corte.

**Linguagem aprovada para o Analyzer:** TypeScript.

**Frameworks aprovados:** usar Fastify na borda HTTP das aplicações TypeScript e a versão estável do Effect no núcleo do Analyzer, principalmente para erros tipados, validação de contratos, configuração, injeção de dependências, retries, timeouts e testes. Evitar na PoC APIs RC ou experimentais e abstrações avançadas que não sejam necessárias ao fluxo.

**Notificação aprovada:** o Analyzer notificará diretamente por uma interface `Notifier`, começando com um webhook local. Isso concentra política, tentativa, resultado e auditoria no dono do incidente. O n8n foi removido do escopo inicial porque sua responsabilidade de classificação já pertence ao Analyzer; poderá ser reavaliado se surgir uma necessidade concreta de orquestração visual ou integração.

---

### CP-02 — Criar ambiente local reproduzível

**Estado:** `CONCLUÍDO`

**Objetivo:** subir a base da PoC localmente com um único procedimento documentado.

**Entregáveis:**

- composição de containers;
- configuração de ambiente de exemplo sem segredos;
- health checks dos componentes;
- instruções para iniciar, verificar e encerrar o ambiente.

**Critérios de aceite:**

- [x] Uma pessoa consegue iniciar o ambiente seguindo apenas a documentação.
- [x] Grafana e demais componentes selecionados ficam acessíveis e saudáveis.
- [x] Nenhum segredo real é versionado.
- [x] Reiniciar os containers não exige configuração manual não documentada.

**Evidências:**

- `compose.yaml` com Analyzer, PostgreSQL, Prometheus, Loki, Alloy e Grafana, todos com health checks;
- `.env.example` e `.gitignore` sem valores secretos reais;
- `README.md` com procedimentos de configuração, início, verificação e encerramento;
- fontes Prometheus e Loki provisionadas no Grafana por `infra/grafana/provisioning/datasources/datasources.yml`;
- configurações versionadas em `infra/prometheus`, `infra/loki` e `infra/alloy`;
- Analyzer TypeScript/Effect construído em container não privilegiado e respondendo `GET /health`;
- `docker compose config --quiet`, `pnpm typecheck` e `pnpm test` executados com sucesso;
- seis containers confirmados saudáveis após `docker compose restart` em 2026-08-27.

---

### CP-03 — Produzir sinais controlados

**Estado:** `CONCLUÍDO`

**Objetivo:** criar uma fonte determinística de falhas para que os testes não dependam de incidentes reais.

**Entregáveis:**

- aplicação ou gerador de sinais de demonstração;
- cenário de operação saudável;
- pelo menos um cenário de erro reproduzível;
- logs e métricas com identidade de serviço e ambiente.

**Critérios de aceite:**

- [x] É possível iniciar e interromper a falha sob demanda.
- [x] Os sinais aparecem na fonte escolhida e podem ser consultados no Grafana.
- [x] Cada sinal contém dados suficientes para identificar serviço, ambiente e período.

**Decisão técnica:** produzir logs e métricas no primeiro corte; traces ficam adiados até existir uma hipótese que justifique sua complexidade.

#### CP-03A — Aplicação e falha controlável

**Estado:** `CONCLUÍDO`

- [x] `checkout-api` inicia saudável e expõe `GET /health`.
- [x] `GET /checkout` responde `200` em operação normal.
- [x] `POST /control/failure` ativa deterministicamente uma resposta `503` no checkout.
- [x] `DELETE /control/failure` interrompe a falha e restaura a resposta `200`.
- [x] O health check continua saudável durante a falha simulada, distinguindo processo ativo de operação degradada.

**Evidências:** dois testes automatizados, typecheck sem erros, build do container concluído e sequência manual `200 → 503 → 200` validada em 2026-08-27.

#### CP-03A.1 — Padronizar a borda HTTP

**Estado:** `CONCLUÍDO`

- [x] `checkout-api` migrada das primitivas HTTP do Node para Fastify.
- [x] Analyzer migrado das primitivas HTTP do Node para Fastify.
- [x] Rotas e contratos externos preservados.
- [x] Testes usam `Fastify.inject()` e não abrem portas TCP.
- [x] Imagens reconstruídas e ambos os containers confirmados saudáveis.

**Evidências:** três testes automatizados e typecheck das duas aplicações concluídos; health check do Analyzer e sequência externa `200 → 503 → 200` da `checkout-api` repetidos com sucesso em 2026-08-27.

#### CP-03B — Logs estruturados no Loki

**Estado:** `CONCLUÍDO`

- [x] `checkout-api` emite logs JSON com serviço, ambiente, timestamp e nível; logs de requisição também incluem `reqId`.
- [x] Operações saudável, degradada e mudança do modo de falha geram eventos semânticos distintos.
- [x] Logging automático de requests desabilitado; sondagens de `/health` e `/metrics` não geram ruído no Loki.
- [x] Alloy descobre somente o container da `checkout-api`, processa seus logs e os envia ao Loki.
- [x] A consulta LogQL da falha retorna `checkout_failed` com código de erro e status HTTP.
- [x] O datasource Loki foi confirmado saudável pela API do Grafana.

**Evidências:** consulta `{service="checkout-api", environment="local"} | json | event="checkout_failed"` retornou exatamente o evento de falha com `error_code="payment_provider_unavailable"` e `http_status=503`; datasource Loki respondeu `status=OK` em 2026-08-27.

**Limitação local:** o Alloy acessa `/var/run/docker.sock` para descoberta e leitura dos logs. A montagem é aceitável somente na PoC local e não representa a estratégia recomendada para produção.

#### CP-03C — Métricas no Prometheus

**Estado:** `CONCLUÍDO`

- [x] `GET /metrics` expõe métricas no formato Prometheus.
- [x] Contador separa operações por resultado e status HTTP com labels limitadas.
- [x] Histograma registra duração da operação por resultado.
- [x] Gauge informa se o modo de falha controlada está ativo.
- [x] Prometheus coleta o target `checkout-api:8081` sem erro.
- [x] A consulta PromQL retorna séries saudável e de falha através do datasource do Grafana.

**Evidências:** três testes automatizados e typecheck concluídos; target `checkout-api` confirmado `up`; consulta `checkout_requests_total{service="checkout-api",environment="local"}` via proxy do Grafana retornou `outcome="success", http_status="200"` e `outcome="failure", http_status="503"` em 2026-08-27.

**Dependência:** `@prometheus-io/client@0.16.1`; o pacote anterior `prom-client` não foi mantido porque passou a indicar oficialmente sua substituição.

---

### CP-04 — Receber e normalizar alertas

**Estado:** `CONCLUÍDO`

**Objetivo:** receber um webhook do Grafana e convertê-lo em um evento interno estável.

**Entregáveis:**

- endpoint de ingestão;
- fixture anonimizada de um webhook real do Grafana;
- schema versionado do evento interno;
- validação e resposta explícita para payload inválido.

**Critérios de aceite:**

- [x] Um alerta de teste chega ao receptor.
- [x] O evento normalizado contém identidade do alerta, serviço, ambiente, estado e timestamps.
- [x] Payload inválido é rejeitado sem interromper o receptor.
- [x] Testes não dependem de uma instância ativa do Grafana.

**Decisões aplicadas:** endpoint direto no Analyzer, labels obrigatórias `alertname`, `service` e `environment`, processamento all-or-nothing e autenticação Bearer com segredo compartilhado.

#### CP-04A — Definir contratos e fixtures

**Estado:** `CONCLUÍDO`

- [x] Schema do webhook do Grafana cobre grupo, alertas, labels, annotations, estado, links e timestamps.
- [x] Schema interno `schemaVersion=1` exige identidade do evento e alerta, serviço, ambiente, estado e timestamps.
- [x] Timestamps externos são decodificados de strings; timestamps internos são instâncias válidas de `Date`.
- [x] Fixture representativa de alerta firing é versionada e anonimizada.
- [x] Payload com estado não suportado e evento interno sem serviço são rejeitados em testes.

**Evidências:** cinco testes do Analyzer e typecheck concluídos em 2026-08-27, sem conexão com Grafana ativo.

**Evidência adicional:** a fixture foi ajustada no CP-04C a partir de um payload emitido pelo Grafana 13.2.0 local, com identificadores e URLs anonimizados.

#### CP-04B — Implementar ingestão e normalização

**Estado:** `CONCLUÍDO`

- [x] `POST /v1/webhooks/grafana` exige Bearer e limita o corpo a 256 KiB.
- [x] Comparação do segredo usa tempo constante e o valor não é registrado.
- [x] Adapter externo exige apenas campos necessários e tolera metadados opcionais do Grafana.
- [x] Módulo de normalização produz um `AlertEvent` por alerta, sem efeitos colaterais.
- [x] Grupo inteiro é rejeitado quando qualquer alerta é semanticamente inválido.
- [x] Respostas distinguem autenticação, formato, semântica e limite de tamanho.

**Evidências:** 13 testes e typecheck aprovados; container saudável; chamadas externas retornaram `401` sem autenticação, `202` com um `eventId` determinístico e `422` para ausência de `labels.service` em 2026-08-28.

**Limitação:** eventos normalizados ainda não são persistidos nem encaminhados. A resposta `202` comprova ingestão e normalização nesta fase; durabilidade será implementada no CP-05.

#### CP-04C — Integrar com Grafana local

**Estado:** `CONCLUÍDO`

- [x] Contact point autenticado com Bearer é provisionado como código.
- [x] Notification policy encaminha alertas ao Analyzer.
- [x] Regra provisionada observa o gauge `checkout_failure_mode`.
- [x] Transições reais `firing` e `resolved` são aceitas pelo Analyzer.
- [x] Fixture foi atualizada com um payload real e anonimizado do Grafana 13.2.0.
- [x] Ambiente foi restaurado com a falha desativada e a regra em estado `Normal`.

**Evidências:** o fluxo local entregou os eventos `e06c9aa7ab2e4109:firing:2026-08-28T13:18:40.000Z` e `e06c9aa7ab2e4109:resolved:2026-08-28T13:10:00.000Z`; 13 testes e typecheck do Analyzer passaram; os sete containers ficaram saudáveis em 2026-08-28.

**Nota de implementação:** nas configurações provisionadas por arquivo, `authorization_credentials` fica em `settings`. Um novo UID de contact point foi usado após a correção para que o Grafana aplicasse a credencial e mantivesse seu valor redigido na API.

---

### CP-05 — Persistir incidentes e eventos

**Estado:** `PENDENTE`

**Objetivo:** manter histórico mínimo e separar o evento recebido do incidente correlacionado.

**Entregáveis:**

- modelo de dados inicial;
- persistência de eventos brutos ou sanitizados, eventos normalizados e incidentes;
- migrations ou mecanismo equivalente;
- consulta simples por identificador do incidente.

**Critérios de aceite:**

- [ ] Um evento recebido pode ser localizado pelo identificador de correlação.
- [ ] O estado persistido sobrevive ao reinício do serviço.
- [ ] Dados sensíveis definidos pela política não são persistidos indevidamente.
- [ ] A evolução do schema é reproduzível.

**Decisões necessárias:** DT-03 e, antes de dados reais, DT-10.

**Evidências:** _a preencher_

---

### CP-06 — Correlacionar, deduplicar e tratar o ciclo de vida

**Estado:** `PENDENTE`

**Objetivo:** agrupar repetições do mesmo problema e controlar transições de estado.

**Entregáveis:**

- chave de correlação documentada;
- janela ou regra de deduplicação;
- estados mínimos do incidente;
- tratamento de eventos ativos e resolvidos.

**Critérios de aceite:**

- [ ] Reenvio idêntico não cria outro incidente.
- [ ] Ocorrências compatíveis atualizam o incidente existente.
- [ ] Serviços ou ambientes diferentes não são correlacionados indevidamente.
- [ ] Um evento resolvido encerra ou atualiza corretamente o incidente correspondente.
- [ ] Regras possuem testes automatizados.

**Evidências:** _a preencher_

---

### CP-07 — Coletar um pacote de evidências

**Estado:** `PENDENTE`

**Objetivo:** buscar contexto relacionado ao incidente sem depender ainda de IA.

**Entregáveis:**

- interface de consulta às fontes selecionadas;
- delimitação de janela temporal e serviço;
- pacote estruturado de evidências;
- limites de volume, timeout e falhas parciais.

**Critérios de aceite:**

- [ ] O pacote contém o alerta e contexto de ao menos logs e métricas, se disponíveis.
- [ ] Cada evidência informa origem, intervalo e referência consultável.
- [ ] Uma fonte indisponível é registrada como limitação sem invalidar todo o pacote.
- [ ] Conteúdo é sanitizado antes de ficar disponível para o modelo.

**Evidências:** _a preencher_

---

### CP-08 — Implementar severidade determinística

**Estado:** `PENDENTE`

**Objetivo:** criar uma linha de base auditável para criticidade, independente do modelo.

**Entregáveis:**

- taxonomia de severidade aprovada;
- metadados mínimos de criticidade do serviço;
- regras iniciais baseadas em ambiente, impacto, duração e sinais;
- justificativa estruturada para a classificação.

**Critérios de aceite:**

- [ ] A mesma entrada sempre produz a mesma classificação.
- [ ] A saída explica quais regras foram acionadas.
- [ ] Casos sem dados suficientes produzem resultado inconclusivo ou conservador definido.
- [ ] Os três cenários de CP-00 possuem resultado esperado testado.

**Decisões necessárias:** DT-08 e DT-09.

**Evidências:** _a preencher_

---

### CP-09 — Gerar RCA assistido por IA

**Estado:** `PENDENTE`

**Objetivo:** converter o pacote de evidências em uma análise estruturada e responsável.

**Entregáveis:**

- contrato de entrada e saída do Analyzer;
- prompt e instruções versionados;
- validação estrutural da resposta;
- suporte explícito a contexto insuficiente;
- implementação substituível do cliente de modelo.

**Critérios de aceite:**

- [ ] A resposta atende ao contrato mínimo do RCA.
- [ ] Afirmações relevantes citam evidências fornecidas.
- [ ] O modelo não recebe segredos nem campos definidos como sensíveis.
- [ ] Evidência contendo instruções maliciosas não altera a política do Analyzer.
- [ ] Saída inválida ou indisponibilidade do modelo gera falha controlada.
- [ ] Existe modo de teste com resposta simulada.

**Decisões necessárias:** DT-05 e DT-06.

**Evidências:** _a preencher_

---

### CP-10 — Combinar regras e recomendação do Analyzer

**Estado:** `PENDENTE`

**Objetivo:** produzir uma decisão de encaminhamento previsível sem conceder controle exclusivo ao modelo.

**Entregáveis:**

- política de combinação entre severidade determinística e recomendação da IA;
- tratamento de divergência e baixa confiança;
- registro da explicação final;
- possibilidade de alterar regras sem mudar prompts.

**Critérios de aceite:**

- [ ] A decisão final pode ser reconstruída a partir das entradas e regras.
- [ ] Baixa confiança ou divergência relevante leva ao caminho conservador definido.
- [ ] O texto produzido pelo modelo não escolhe diretamente credenciais, URLs ou destinatários.
- [ ] Regras possuem testes automatizados.

**Evidências:** _a preencher_

---

### CP-11 — Notificar com responsabilidade

**Estado:** `PENDENTE`

**Objetivo:** enviar uma mensagem acionável ao destino correto e evitar ruído repetido.

**Entregáveis:**

- adaptador para o canal escolhido;
- template contendo resumo, severidade, confiança, evidências e ações;
- política inicial de roteamento;
- registro de tentativas e resultado do envio.

**Critérios de aceite:**

- [ ] Cada cenário de CP-00 é enviado ao destino esperado.
- [ ] O envio contém um identificador do incidente e referências para investigação.
- [ ] Evento duplicado não gera spam.
- [ ] Falha de envio é registrada e pode ser repetida com segurança.
- [ ] Conteúdo sensível não aparece na notificação.

**Decisão necessária:** DT-07.

**Evidências:** _a preencher_

---

### CP-12 — Medir custo, latência e qualidade

**Estado:** `PENDENTE`

**Objetivo:** produzir dados que permitam decidir se a PoC merece evoluir.

**Entregáveis:**

- métricas de duração por etapa;
- consumo de tokens e custo estimado por análise;
- formulário ou mecanismo simples de avaliação humana;
- relatório dos cenários executados.

**Critérios de aceite:**

- [ ] Cada análise registra modelo, tokens, duração e custo quando disponíveis.
- [ ] O auditor consegue classificar utilidade, correção da severidade e qualidade das evidências.
- [ ] Os três cenários de CP-00 foram executados de ponta a ponta.
- [ ] Resultados são comparados aos critérios de sucesso definidos em CP-00.

**Evidências:** _a preencher_

---

### CP-13 — Revisar segurança e falhas operacionais

**Estado:** `PENDENTE`

**Objetivo:** verificar se a demonstração falha de forma segura antes de utilizar dados ou canais reais.

**Entregáveis:**

- inventário de segredos e dados sensíveis;
- revisão de permissões das integrações;
- testes de indisponibilidade das fontes, banco, modelo e canal;
- lista de riscos aceitos e correções necessárias.

**Critérios de aceite:**

- [ ] Nenhum segredo está versionado ou exposto em logs.
- [ ] O Analyzer possui somente os acessos necessários.
- [ ] Falhas parciais não produzem RCA enganoso.
- [ ] Riscos remanescentes possuem responsável e decisão registrada.

**Evidências:** _a preencher_

---

### CP-14 — Decisão de continuidade

**Estado:** `PENDENTE`

**Objetivo:** concluir formalmente a PoC e decidir o próximo investimento.

**Entregáveis:**

- demonstração reproduzível;
- relatório de resultados e limitações;
- decisão entre encerrar, iterar ou avançar para piloto;
- backlog separado para uma eventual fase seguinte.

**Critérios de aceite:**

- [ ] Resultados estão sustentados por dados coletados em CP-12.
- [ ] Limitações conhecidas estão documentadas.
- [ ] A decisão e seus responsáveis estão registrados.
- [ ] Itens de produto, como Hub, papéis e integração com portal, não estão misturados aos débitos da PoC.

**Evidências:** _a preencher_

## Cenários de validação

Os cenários abaixo formam a linha de base aprovada no CP-00. Os valores exatos dos limiares serão definidos durante a instrumentação e as regras de severidade.

### CV-01 — Erro isolado sem impacto relevante

- **Entrada controlada:** uma única requisição falha, seguida por operação normal.
- **Sinais:** log de erro identificado por serviço e ambiente; contador de requisições e erros; alerta do Grafana, caso o limiar escolhido permita exercitar o fluxo.
- **Resultado esperado:** registrar ou analisar a ocorrência sem classificá-la como crítica; informar que não existe evidência de impacto sustentado; não inventar uma causa definitiva.
- **Valida:** comportamento diante de pouco contexto e proteção contra escalada indevida.
- **Estado:** `APROVADO`.

### CV-02 — Crescimento sustentado da taxa de erros

- **Entrada controlada:** falha habilitada por alguns minutos, afetando uma parcela configurável das requisições.
- **Sinais:** aumento da taxa de erros, logs repetidos com a mesma assinatura e alerta ativo do Grafana.
- **Resultado esperado:** correlacionar repetições em um incidente, estimar o impacto com base nas métricas, recomendar severidade superior ao CV-01 e emitir apenas a notificação prevista pela política.
- **Valida:** correlação, deduplicação, estimativa de impacto, classificação e roteamento.
- **Estado:** `APROVADO`.

### CV-03 — Serviço indisponível após mudança

- **Entrada controlada:** registrar uma mudança de versão ou configuração e, depois, tornar o serviço indisponível.
- **Sinais:** marcador da mudança, falhas de health check, taxa elevada de erros e logs da aplicação.
- **Resultado esperado:** identificar indisponibilidade e proximidade temporal com a mudança; classificar como crítico no ambiente definido para o teste; sugerir verificação ou rollback, sem declarar que a mudança foi a causa quando houver apenas correlação temporal.
- **Valida:** criticidade, uso conjunto de evidências e distinção entre correlação e causalidade.
- **Estado:** `APROVADO`.

## Riscos conhecidos

| Risco                                 | Consequência                             | Mitigação inicial                                                      |
| ------------------------------------- | ---------------------------------------- | ---------------------------------------------------------------------- |
| Alerta não contém contexto suficiente | RCA genérico ou incorreto                | Buscar evidências nas fontes e permitir resultado inconclusivo         |
| Correlação incorreta                  | Mistura de incidentes diferentes         | Incluir serviço, ambiente e identidade do alerta na chave              |
| Alucinação do modelo                  | Ação humana baseada em informação falsa  | Exigir evidências, confiança, limitações e validação estrutural        |
| Prompt injection por logs             | Desvio da análise ou exposição de dados  | Tratar logs como dados não confiáveis e limitar ferramentas/permissões |
| Dados sensíveis enviados ao provedor  | Incidente de segurança ou privacidade    | Sanitização, allowlist de campos e política de retenção                |
| Excesso de notificações               | Canal ignorado pelos operadores          | Deduplicação, cooldown e política de roteamento                        |
| n8n concentrar regras de negócio      | Baixa testabilidade e difícil evolução   | Manter contratos e regras centrais no Analyzer, caso n8n seja adotado  |
| Classificação baseada apenas no texto | Severidade incompatível com impacto real | Combinar regras, metadados de serviço e sinais objetivos               |
| Alloy com acesso ao socket Docker     | Comprometimento do coletor pode afetar o host | Restringir à PoC local; em produção usar coleta isolada e menor privilégio |

## Registro de decisões

Usar uma entrada por decisão tomada:

```text
### DEC-XXX — Título

- Data:
- Estado: proposta | aceita | substituída
- Contexto:
- Decisão:
- Alternativas consideradas:
- Consequências:
- Checkpoints afetados:
```

### DEC-001 — Escopo de validação da PoC

- **Data:** 2026-08-27
- **Estado:** aceita
- **Contexto:** o CP-00 precisava definir domínio, responsáveis e limites iniciais de avaliação.
- **Decisão:** utilizar aplicação genérica; manter 120 segundos como alvo exploratório entre webhook e notificação; realizar a auditoria inicial pelo responsável técnico.
- **Alternativas consideradas:** aplicação baseada em domínio corporativo; auditor operacional adicional já na PoC; meta de latência mais agressiva.
- **Consequências:** incidentes serão controlados e reproduzíveis; conclusões sobre utilidade operacional externa serão tratadas como limitação até existir disponibilidade de outro avaliador.
- **Checkpoints afetados:** CP-00, CP-03, CP-12 e CP-14.

### DEC-002 — Linguagem do Analyzer

- **Data:** 2026-08-27
- **Estado:** aceita
- **Contexto:** a implementação do Analyzer precisa refletir a preferência técnica do responsável pela PoC e permanecer testável fora do n8n.
- **Decisão:** implementar o Analyzer em TypeScript.
- **Alternativas consideradas:** Python com FastAPI.
- **Consequências:** contratos, aplicação genérica e integrações podem compartilhar tipos e ferramentas; o uso de Effect permanece como decisão separada em DT-11.
- **Checkpoints afetados:** CP-01, CP-03, CP-04 e CP-09.

### DEC-003 — Arquitetura sem n8n no escopo inicial

- **Data:** 2026-08-27
- **Estado:** aceita
- **Contexto:** na referência original, o n8n classificava incidentes; no desenho da PoC essa responsabilidade já pertence ao Analyzer, tornando o n8n um repasse sem responsabilidade relevante.
- **Decisão:** Grafana enviará o webhook diretamente ao Analyzer; o Analyzer usará Effect estável, PostgreSQL como persistência e fila durável e uma interface `Notifier` para entregar inicialmente a um webhook local.
- **Alternativas consideradas:** n8n somente no ingresso; n8n no ingresso e na saída; notificação devolvida ao n8n.
- **Consequências:** menos componentes e credenciais, auditoria concentrada e contratos tipados; integrações visuais do n8n ficam fora da PoC e podem ser reconsideradas quando houver caso concreto.
- **Checkpoints afetados:** CP-01, CP-02, CP-04, CP-05 e CP-11.

### DEC-004 — Sinais iniciais de observabilidade

- **Data:** 2026-08-27
- **Estado:** aceita
- **Contexto:** a PoC precisa correlacionar falhas reproduzíveis com evidências, mantendo o primeiro ciclo pequeno e auditável.
- **Decisão:** instrumentar inicialmente logs e métricas da `checkout-api`; traces ficam fora deste corte.
- **Alternativas consideradas:** somente logs; logs, métricas e traces desde o início.
- **Consequências:** Prometheus e Loki cobrem as hipóteses iniciais com menos instrumentação; traces podem ser adicionados se os cenários demonstrarem uma lacuna real de correlação.
- **Checkpoints afetados:** CP-03, CP-06 e CP-07.

### DEC-005 — Fastify como borda HTTP

- **Data:** 2026-08-27
- **Estado:** aceita
- **Contexto:** as aplicações começavam a acumular roteamento, respostas e testes diretamente sobre primitivas HTTP do Node.
- **Decisão:** usar Fastify na borda HTTP da `checkout-api` e do Analyzer; manter Effect no núcleo e na composição dos casos de uso do Analyzer.
- **Alternativas consideradas:** continuar com `node:http`; adotar o servidor HTTP de `@effect/platform`; usar Express.
- **Consequências:** roteamento, ciclo de vida, testes por injeção e futura validação/logging ficam padronizados; Fastify passa a ser uma dependência de runtime das duas aplicações.
- **Checkpoints afetados:** CP-03, CP-04 e CP-11.

### DEC-006 — Contrato de ingestão do Grafana

- **Data:** 2026-08-28
- **Estado:** aceita
- **Contexto:** o CP-04B precisava definir autenticação, identidade mínima e comportamento para grupos parcialmente inválidos.
- **Decisão:** usar Bearer compartilhado; exigir as labels `alertname`, `service` e `environment`; normalizar um evento por alerta; rejeitar o grupo inteiro se qualquer item for inválido.
- **Alternativas consideradas:** Basic Auth; labels configuráveis já na PoC; aceitação parcial de grupos.
- **Consequências:** interface pequena e determinística, erros de configuração visíveis e ausência de efeitos parciais; aliases de labels ficam fora do primeiro corte.
- **Checkpoints afetados:** CP-04, CP-05 e CP-06.

## Histórico de atualizações

| Data       | Alteração                                                       | Responsável |
| ---------- | --------------------------------------------------------------- | ----------- |
| 2026-08-27 | Criação da fonte da verdade, requisitos e checkpoints iniciais. | Codex       |
| 2026-08-27 | CP-00 iniciado com cenários e métricas propostos para discussão. | Codex       |
| 2026-08-27 | CP-00 concluído; CP-01 iniciado com stack e credenciais propostas. | Codex       |
| 2026-08-27 | TypeScript aprovado; Effect e notificação direta registrados para discussão. | Codex       |
| 2026-08-27 | CP-01 concluído com n8n removido e notificação direta aprovada. | Codex       |
| 2026-08-27 | CP-02 concluído com ambiente local reproduzível e seis serviços saudáveis. | Codex       |
| 2026-08-27 | CP-03 dividido em entregas menores; CP-03A concluído com falha controlável. | Codex       |
| 2026-08-27 | CP-03A.1 concluído com Fastify nas duas bordas HTTP. | Codex       |
| 2026-08-27 | CP-03B concluído com logs estruturados coletados pelo Alloy e consultados no Loki. | Codex       |
| 2026-08-27 | CP-03 e CP-03C concluídos com métricas coletadas e consultadas através do Grafana. | Codex       |
| 2026-08-27 | Logs automáticos de requests removidos; eventos semânticos preservados. | Codex       |
| 2026-08-27 | CP-04 iniciado; CP-04A concluído com schemas e fixtures testados. | Codex       |
| 2026-08-28 | CP-04B concluído com ingestão autenticada e normalização all-or-nothing. | Codex       |
| 2026-08-28 | CP-04 e CP-04C concluídos com alerta real firing/resolved entregue pelo Grafana. | Codex       |
