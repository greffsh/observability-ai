# PoC de RCA assistido por IA — fonte da verdade

> Documento vivo de requisitos, decisões e progresso da PoC.
>
> Última atualização: 2026-09-03

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
| RF-14 | Registrar, quando disponíveis, o agente/modelo utilizado, duração e custo estimado da análise.   |   Desejável | PENDENTE |
| RF-15 | Permitir reanalisar um incidente de forma controlada.                                            |   Desejável | PENDENTE |
| RF-16 | Registrar feedback humano sobre severidade e utilidade do RCA.                                   |   Desejável | PENDENTE |
| RF-17 | Entregar o contexto do incidente ao agente sem acoplar o Analyzer ao repositório analisado.      | Obrigatório | PENDENTE |

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

| ID    | Decisão                                     | Opções iniciais                                          | Necessária antes de       | Estado   |
| ----- | ------------------------------------------- | -------------------------------------------------------- | ------------------------- | -------- |
| DT-01 | Papel do n8n                                | Removido do escopo inicial                               | CP-04                     | DECIDIDO |
| DT-02 | Linguagem do Analyzer                       | TypeScript                                               | CP-04                     | DECIDIDO |
| DT-03 | Banco da PoC                                | PostgreSQL                                               | CP-05                     | DECIDIDO |
| DT-04 | Fontes de observabilidade locais            | Logs + métricas; traces adiados                          | CP-03                     | DECIDIDO |
| DT-05 | Agente e modelo de IA                       | Escolhidos pelo operador no momento da análise           | CP-09                     | DECIDIDO |
| DT-06 | Estratégia de acesso ao modelo              | Execução manual por skill; sem cliente de IA no Analyzer | CP-09                     | DECIDIDO |
| DT-07 | Canal inicial de notificação                | Webhook local enviado diretamente pelo Analyzer          | CP-11                     | DECIDIDO |
| DT-08 | Taxonomia de severidade                     | Informativa, baixa, média, alta, crítica e inconclusiva  | CP-08                     | DECIDIDO |
| DT-09 | Metadados de criticidade dos serviços       | Catálogo versionado por serviço e ambiente               | CP-08                     | DECIDIDO |
| DT-10 | Política de retenção de payloads e análises | A definir                                                | Antes de usar dados reais | PENDENTE |
| DT-11 | Framework do Analyzer                       | Effect estável com adoção controlada                     | CP-04                     | DECIDIDO |
| DT-12 | Framework HTTP                              | Fastify nas aplicações TypeScript                        | CP-03                     | DECIDIDO |
| DT-13 | Acesso à codebase                           | Repositório local apontado explicitamente ao agente      | CP-09                     | DECIDIDO |

## Inventário preliminar de contas e credenciais

| Componente                 | Conta externa necessária na PoC               | Segredo ou identidade local                                        | Observação                                                                |
| -------------------------- | --------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| Docker / Docker Compose    | Não                                           | Nenhum                                                             | Imagens públicas e ambiente executado localmente.                         |
| Grafana OSS                | Não                                           | Usuário e senha de administrador local                             | Não confundir com uma conta Grafana Cloud, que não é necessária.          |
| Webhook Grafana → Analyzer | Não                                           | Segredo compartilhado para autenticar o webhook                    | Deve ser diferente das credenciais administrativas do Grafana.            |
| Prometheus                 | Não                                           | Nenhum no ambiente local isolado                                   | Acesso restrito à rede interna do Compose.                                |
| Loki                       | Não                                           | Nenhum nativo na configuração local proposta                       | Não expor publicamente; Loki não fornece camada de autenticação embutida. |
| Grafana Alloy              | Não                                           | Nenhum                                                             | Permissões de coleta devem ser limitadas às fontes necessárias.           |
| PostgreSQL                 | Não                                           | Usuário e senha próprios do Analyzer                               | Segredos locais gerados para a PoC e não versionados.                     |
| Analyzer                   | Não                                           | Segredos internos para chamadas recebidas e fechamento operacional | Não recebe credencial de repositório nem de provedor de IA.               |
| Agente de RCA              | Depende da ferramenta escolhida pelo operador | Fora do runtime do Analyzer                                        | Recebe o pacote do incidente e acesso explícito a um checkout local.      |
| Canal de chat corporativo  | Não no primeiro corte                         | Futuramente, webhook ou credencial de bot                          | O primeiro destino será um receptor local.                                |

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
- exigir que os três cenários controlados percorram automaticamente o fluxo até a montagem do contexto e usem um handoff operacional explícito para o RCA;
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
                                           ├── persiste no PostgreSQL
                                           └── expõe contexto e severidade
                                                      │ handoff manual
                                                      v
                                         agente de RCA + checkout local
```

**Componentes propostos:**

- Docker Compose para o ambiente local;
- Grafana OSS com configuração provisionada em arquivos;
- Prometheus para métricas;
- Loki para logs;
- Grafana Alloy para coleta e encaminhamento dos logs;
- Analyzer como aplicação independente, sem acesso ao repositório nem cliente de IA neste corte;
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

**Estado:** `CONCLUÍDO`

**Objetivo:** manter histórico mínimo e separar o evento recebido do incidente correlacionado.

**Entregáveis:**

- modelo de dados inicial;
- persistência de eventos brutos ou sanitizados, eventos normalizados e incidentes;
- migrations ou mecanismo equivalente;
- consulta simples por identificador do evento; consulta por incidente será adicionada após a correlação no CP-06.

**Critérios de aceite:**

- [x] Um evento recebido pode ser localizado pelo `event_id`.
- [x] O estado persistido sobrevive ao reinício do serviço.
- [x] O corpo bruto não é persistido; somente o contrato interno sanitizado é armazenado.
- [x] A evolução do schema é reproduzível.

**Decisões necessárias:** DT-03 e, antes de dados reais, DT-10.

**Evidências:** CP-05A, CP-05B e CP-05C concluídos; evento real persistido, deduplicado, consultado e recuperado após reinício do Analyzer em 2026-08-28.

#### CP-05A — Aprovar o modelo mínimo de persistência

**Estado:** `CONCLUÍDO`

**Proposta para auditoria:**

- `alert_events` será append-only e terá `event_id` único para impedir a persistência duplicada do mesmo evento do Grafana;
- cada evento guardará os campos normalizados necessários para consulta, o `schema_version` e um snapshot JSONB sanitizado do contrato interno;
- `incidents` terá identidade própria e ciclo de vida separado dos eventos que o compõem;
- a associação entre evento e incidente será explícita por chave estrangeira e poderá ser preenchida pela correlação no CP-06;
- timestamps do domínio (`started_at`, `ended_at` e `received_at`) serão separados dos timestamps de auditoria do banco;
- o corpo bruto do webhook não será persistido por padrão; a decisão de retenção de payloads reais continua em DT-10;
- o módulo de persistência apresentará uma interface pequena ao caso de uso de ingestão e esconderá transações, SQL e tratamento de duplicatas.

**Tabelas propostas:**

- `alert_events`: identidade externa, versão do schema, estado, serviço, ambiente, fingerprint, timestamps, labels, annotations e referência opcional ao incidente;
- `incidents`: identidade interna, estado, serviço, ambiente, chave de correlação, primeira e última observação e resolução;
- migrations versionadas em diretório próprio do Analyzer.

**Pontos pendentes antes do CP-05B:**

- [x] Persistir apenas o contrato normalizado/sanitizado, sem corpo bruto do webhook.
- [x] Usar `@effect/sql-pg`, com SQL explícito e migrator do próprio pacote.
- [x] Implementar a regra que associa eventos a incidentes somente no CP-06.

**Evidência:** decisões aprovadas em 2026-08-28 antes do início do schema físico.

#### CP-05B — Criar schema e migrations

**Estado:** `CONCLUÍDO`

- [x] Migration `0001_initial_persistence` cria `incidents` e `alert_events`.
- [x] Constraints validam estados, ordem temporal, resolução e documentos JSON.
- [x] `event_id` é único e os índices iniciais de consulta foram criados.
- [x] Analyzer aplica migrations antes de iniciar a borda HTTP.
- [x] Comando independente `pnpm migrate` permite aplicação manual.
- [x] Reexecução não reaplica migrations concluídas.

**Evidências:** migration aplicada no PostgreSQL 18.6 local; tabelas `incidents`, `alert_events` e `effect_sql_migrations` e sete índices confirmados; reinício registrou `Database schema is up to date`; 15 testes, typecheck e build aprovados em 2026-08-28.

#### CP-05C — Persistir e consultar eventos

**Estado:** `CONCLUÍDO`

- [x] Interface `EventStore` esconde transação, SQL e tratamento de duplicatas.
- [x] Adapters PostgreSQL e memória exercitam o mesmo seam em produção e testes.
- [x] Grupo normalizado é persistido em uma transação antes da resposta `202`.
- [x] `ON CONFLICT (event_id) DO NOTHING` reconhece reenvios sem criar nova linha.
- [x] Resposta informa quantidades `inserted` e `duplicates`.
- [x] Falha de persistência retorna `503` para permitir nova tentativa do Grafana.
- [x] `GET /v1/events/:eventId` autenticado permite auditoria e distingue `404` de indisponibilidade.
- [x] `incident_id` permanece nulo até as regras de correlação do CP-06.

**Evidências:** evento `cp05c-audit:firing:2026-08-28T17:30:00.000Z` retornou `inserted=1` na primeira entrega e `duplicates=1` no reenvio; uma única linha foi confirmada no PostgreSQL; consulta HTTP preservou o mesmo UUID e conteúdo após reiniciar o Analyzer; 19 testes, typecheck e build aprovados em 2026-08-28.

---

### CP-06 — Correlacionar, deduplicar e tratar o ciclo de vida

**Estado:** `CONCLUÍDO`

**Objetivo:** agrupar repetições do mesmo problema e controlar transições de estado.

**Entregáveis:**

- chave de correlação documentada;
- janela ou regra de deduplicação;
- estados mínimos do incidente;
- tratamento de eventos ativos e resolvidos.

**Critérios de aceite:**

- [x] Reenvio idêntico não cria outro incidente.
- [x] Ocorrências compatíveis são associadas ao mesmo incidente operacional.
- [x] Serviços ou ambientes diferentes não são correlacionados indevidamente.
- [x] Um evento resolvido encerra sua ocorrência e o incidente permanece aberto enquanto houver outra ocorrência aberta.
- [x] Regras possuem testes automatizados.

**Evidências:** CP-06A, CP-06B e CP-06C concluídos; 26 testes e typecheck aprovados; migration e fluxos normal, duplicado e fora de ordem validados no PostgreSQL local em 2026-08-31.

**Revisão pós-entrega:** a DEC-013 substitui a equivalência entre ocorrência e incidente aprovada originalmente em CP-06A/CP-06B. As subseções abaixo preservam o histórico da decisão anterior; o modelo vigente está registrado em CP-06D.

#### CP-06A — Aprovar o domínio e os casos-limite

**Estado:** `CONCLUÍDO`

**Decisões confirmadas:**

- nesta etapa, cada incidente representa exatamente uma ocorrência de uma instância de alerta;
- alertas diferentes permanecem em incidentes separados, mesmo que ocorram próximos ou pareçam relacionados;
- um evento `resolved` sem incidente aberto cria um incidente já resolvido, marcado com ciclo de vida parcial;
- se o `firing` correspondente chegar depois, ele é associado ao incidente reconstruído e completa seu histórico sem reabri-lo;
- reenvios do mesmo `resolved` continuam sujeitos à idempotência por `event_id` e não criam novos incidentes;
- notificações com o mesmo `event_id` são duplicatas estritas: não criam outro evento ou incidente e não atualizam `last_seen_at`;
- retries de transporte e lembretes idênticos do Grafana não serão diferenciados nesta etapa; auditoria de entregas, se necessária, será um conceito separado;
- um `firing` com novo `startsAt` para uma instância que ainda possui incidente aberto inicia outro episódio;
- o incidente anterior passa para `closed_unconfirmed`, sem afirmar recuperação, e o novo incidente passa para `open`;
- um `resolved` atrasado pode atualizar o incidente anterior de `closed_unconfirmed` para `resolved`, usando o `startsAt` para selecionar o episódio correto;
- deve existir no máximo um incidente `open` por identidade de instância de alerta;
- todo evento `resolved` compatível encerra o incidente como `resolved`, independentemente de `grafana_state_reason`;
- `grafana_state_reason`, quando existir, permanece nas annotations do evento para auditoria, mas não produz ramificações no ciclo de vida desta etapa;
- a identidade da instância combina origem, ambiente, serviço, nome do alerta e `fingerprint`;
- o episódio específico combina a identidade da instância com `startsAt`;
- usar `startsAt` como verificação do episódio, sem tratá-lo isoladamente como identidade;
- diante de conflito entre identidade e timestamps, persistir o evento e registrar a inconsistência sem encerrar automaticamente um incidente mais novo.

**Evidências:** glossário em `CONTEXT.md`; pesquisa em `docs/research/grafana-alert-identity.md`; identidade, estados e casos-limite aprovados em conversa em 2026-08-28. Nenhuma regra foi implementada ainda.

#### CP-06B — Aprovar o modelo persistido de incidentes

**Estado:** `CONCLUÍDO`

**Modelo aprovado:**

- manter a relação `incidents 1:N alert_events`, sem criar `alert_occurrences` nesta etapa;
- usar `correlation_key` como hash canônico da identidade da instância;
- identificar unicamente um episódio pela combinação `correlation_key + started_at`;
- estados do incidente: `open`, `resolved` e `closed_unconfirmed`;
- registrar `firing_observed` para distinguir um ciclo acompanhado desde o disparo de um incidente reconstruído apenas pelo `resolved`;
- substituir o ambíguo `first_seen_at` por `started_at`, que representa o `startsAt` do Grafana;
- remover `last_seen_at`, pois duplicatas estritas não representam novas observações de domínio;
- manter `resolved_at` como o `endsAt` informado pelo Grafana e `created_at`/`updated_at` como auditoria do Analyzer;
- manter `incident_id` em `alert_events` para associar cada evento ao episódio correspondente;
- garantir por índice parcial no máximo um incidente `open` por `correlation_key`;
- garantir por índice único que `correlation_key + started_at` não produza dois incidentes para o mesmo episódio.

**Invariantes propostas:**

- `open` não possui `resolved_at`;
- `resolved` possui `resolved_at`;
- `resolved_at` não pode ser anterior a `started_at`;
- `closed_unconfirmed` não possui `resolved_at`;
- um incidente reconstruído nasce `resolved` com `firing_observed=false`;
- um incidente observado desde o `firing` nasce `open` com `firing_observed=true`;
- um `firing` atrasado muda `firing_observed` para `true`, sem reabrir um incidente já resolvido.

**Evidências:** modelo confrontado com o glossário, a migration inicial e os casos fora de ordem; ajuste temporal incorporado; migration `0002_incident_lifecycle` aplicada com sucesso no PostgreSQL 18.6 local em 2026-08-31.

#### CP-06C — Implementar correlação e ciclo de vida

**Estado:** `CONCLUÍDO`

- [x] A chave de correlação usa SHA-256 sobre uma tupla canônica de origem, ambiente, serviço, nome e fingerprint do alerta.
- [x] Evento, incidente e associação são persistidos na mesma transação.
- [x] Duplicata estrita por `event_id` não cria nem atualiza incidente.
- [x] `firing` e `resolved` da mesma ocorrência são associados pelo mesmo `correlation_key + started_at`.
- [x] Uma resolução recebida antes do disparo cria um incidente reconstruído e o `firing` atrasado completa o histórico sem reabri-lo.
- [x] Uma nova ocorrência encerra a anterior como `closed_unconfirmed`; uma resolução atrasada atualiza somente a ocorrência correspondente.
- [x] Locks transacionais por chave e índices únicos preservam as invariantes diante de ingestões concorrentes.
- [x] Adapters PostgreSQL e memória implementam o mesmo comportamento observável.
- [x] `GET /v1/incidents/:incidentId` permite consultar o incidente correlacionado.

**Evidências:** cinco testes automatizados específicos de correlação e 26 testes totais aprovados; typecheck e build concluídos; migration aplicada e schema/índices inspecionados; fluxo real confirmou uma duplicata sem novo incidente e a transição `open → resolved`; cenário fora de ordem confirmou `closed_unconfirmed → resolved` no incidente anterior mantendo o mais novo `open`, em 2026-08-31.

#### CP-06D — Separar ocorrências de incidentes operacionais

**Estado:** `CONCLUÍDO`

- [x] Eventos pertencem a uma ocorrência de alerta identificada por instância e `startsAt`.
- [x] Uma ocorrência pertence a exatamente um incidente por associação auditável.
- [x] Um incidente aceita múltiplas ocorrências relacionadas do mesmo serviço e ambiente.
- [x] A política v1 associa por escopo e proximidade de até 10 minutos somente quando existe um candidato não ambíguo.
- [x] Resolução parcial mantém o incidente `open`; ausência de ocorrências abertas produz `awaiting_confirmation`.
- [x] IDs dos incidentes existentes são preservados e eventos legados sem vínculo são reconstruídos.
- [x] Adapter em memória e PostgreSQL apresentam o mesmo comportamento 1:N.

**Evidências:** migration `0003_alert_occurrences`; tabelas `alert_occurrences` e `incident_occurrences`; 40 testes do Analyzer; backfill real de 17 eventos para 10 ocorrências sem vínculos ausentes; teste PostgreSQL com duas ocorrências no incidente `659b515f-4662-45e4-9a5d-e782ea652b0f`, mantendo `open` após resolução parcial e transitando para `awaiting_confirmation` após a última resolução; backup anterior à migration em `/tmp/grafana-ai-pre-occurrence-model.dump`.

#### CP-06E — Encerrar incidentes com confirmação operacional

**Estado:** `CONCLUÍDO`

- [x] Somente um incidente em `awaiting_confirmation` pode ser encerrado normalmente.
- [x] A credencial do operador é distinta da credencial de ingestão do Grafana.
- [x] O fechamento registra instante, método, razão, identidade e nota opcional.
- [x] Repetir o mesmo comando é idempotente; tentar substituir a auditoria retorna conflito.
- [x] Um incidente encerrado permanece terminal diante de eventos atrasados e não participa de novas correlações.
- [x] O adapter PostgreSQL verifica estado e ocorrências abertas na mesma transação.

**Evidências:** migration `0005_incident_closure`; endpoint autenticado `PUT /v1/incidents/:incidentId/closure`; testes HTTP e do adapter em memória; validação PostgreSQL real dos resultados `200`, `409` e `401`, persistência da auditoria e chegada de `firing` atrasado sem remover o estado `closed`.

---

### CP-07 — Coletar um pacote de evidências

**Estado:** `CONCLUÍDO`

**Objetivo:** buscar contexto observável relacionado ao incidente, sem depender de IA nem acessar a codebase.

**Entregáveis:**

- interface de consulta às fontes selecionadas;
- delimitação de janela temporal e serviço;
- pacote estruturado de evidências;
- limites de volume, timeout e falhas parciais.

**Critérios de aceite:**

- [x] O pacote contém o alerta e contexto de logs e métricas, se disponíveis.
- [x] Cada evidência informa origem, intervalo e referência consultável.
- [x] Uma fonte indisponível é registrada como limitação sem invalidar todo o pacote.
- [x] Conteúdo é sanitizado antes de ser entregue a um consumidor externo.

**Evidências:** módulo `services/analyzer/src/evidence`; endpoint autenticado `POST /v1/incidents/:incidentId/evidence`; adapters limitados para Prometheus e Loki; pesquisa `docs/research/cp07-evidence-source-apis.md`; testes e typecheck aprovados.

**Revisão de escopo em 2026-09-02:** a integração direta com repositório foi removida. Código não é uma fonte de evidência do Analyzer; no CP-09, o operador fornecerá separadamente um checkout local ao agente de RCA.

---

### CP-08 — Implementar severidade determinística

**Estado:** `CONCLUÍDO`

**Objetivo:** criar uma linha de base auditável para criticidade, independente do modelo.

**Marco de entrega atual:** a primeira entrega do projeto será encerrada ao concluir este checkpoint. CP-09 a CP-14 permanecem planejados para uma fase posterior; não fazem parte desta entrega e não são considerados concluídos ou descartados.

**Entregáveis:**

- taxonomia de severidade aprovada;
- metadados mínimos de criticidade do serviço;
- regras iniciais baseadas em ambiente, impacto, duração e sinais;
- justificativa estruturada para a classificação.

**Critérios de aceite:**

- [x] A mesma entrada sempre produz a mesma classificação.
- [x] A saída explica quais regras foram acionadas.
- [x] Casos sem dados suficientes produzem resultado inconclusivo ou conservador definido.
- [x] Os três cenários de CP-00 possuem resultado esperado testado.

**Decisões:** DT-08 e DT-09 concluídas pela DEC-012.

**Taxonomia aprovada:** `informativa`, `baixa`, `media`, `alta`, `critica` e `inconclusiva`. O último valor representa ausência de dados suficientes e não participa da ordenação de impacto.

**Política inicial:** o catálogo versionado define a `checkout-api` como criticidade `high` no ambiente `local`, com teto `critica`. Tráfego sem impacto é informativo; uma falha isolada é baixa; múltiplas falhas são médias; falha por pelo menos 60 segundos ou cinco falhas com taxa mínima de 50% é alta; disponibilidade igual a zero em serviço de alta criticidade é crítica. Ausência de sinais mensuráveis ou de metadados do serviço/ambiente produz resultado inconclusivo.

**Auditoria dos sinais disponíveis:** `checkout-api` agora distingue `healthy`, `degraded` e `unavailable`, expõe `checkout_availability` e registra `checkout_last_change_timestamp_seconds`. A mudança recente é somente uma observação contextual. A regra crítica depende exclusivamente da indisponibilidade medida e não do texto do alerta nem da proximidade com a mudança.

**Generalização pós-entrega:** o classificador não conhece nomes de métricas de nenhum serviço. Um catálogo externo associa `service + environment` a criticidade, teto e consultas PromQL; a coleta converte os resultados em sinais de impacto normalizados antes de aplicar as regras. A `checkout-api` é o primeiro perfil e um novo serviço pode ser cadastrado sem recompilar o Analyzer. O Alloy recebe logs e métricas OTLP e normaliza `service.name` e `deployment.environment.name` para a identidade usada pelo incidente.

**Evidências:** módulo `services/analyzer/src/severity`; endpoint autenticado `POST /v1/incidents/:incidentId/severity`; modos e métricas controláveis em `services/checkout-api`; testes automatizados dos cenários CV-01 (`baixa`), CV-02 (`alta`) e CV-03 (`critica`); 51 testes, typecheck e build aprovados. Após a generalização, CV-03 foi revalidado no incidente `5db1fa0e-b999-42df-acad-d9cee49731a6`, com regra `SERVICE_UNAVAILABLE`, evidência normalizada `metrics-4` e mudança recente explicitamente tratada como não causal. Logs e métrica OTLP de `connect-external/test` também foram recebidos e consultados no Loki e Prometheus. Counters positivos sem amostra-base passaram a produzir sinal desconhecido e limitação explícita, enquanto counters inicializados em zero, resets e múltiplas séries são medidos deterministicamente.

---

### CP-09 — Gerar RCA assistido por IA

**Estado:** `EM ANDAMENTO`

**Objetivo:** validar um RCA assistido manualmente, entregando ao agente o contexto do incidente e, separadamente, um checkout local escolhido pelo operador.

**Entregáveis:**

- contrato único de handoff com incidente, ocorrências, evidências e severidade;
- skill e instruções versionadas para gerar o RCA;
- mecanismo simples para exportar o contexto e apontar o checkout local ao agente;
- contrato estruturado de saída do RCA;
- suporte explícito a contexto insuficiente;

**Critérios de aceite:**

- [ ] A resposta atende ao contrato mínimo do RCA.
- [ ] Afirmações observacionais citam o pacote; conclusões sobre código citam arquivo e linha do checkout consultado.
- [ ] O pacote não contém segredos, credenciais de repositório ou conteúdo de código.
- [ ] Evidência contendo instruções maliciosas é tratada como dado, não como instrução ao agente.
- [ ] O agente declara quando o contexto ou o checkout são insuficientes.
- [ ] A execução manual é reproduzível a partir de um incidente controlado e um caminho de repositório explícito.

**Sequência acordada para a próxima fase:**

1. `CONCLUÍDO` — melhorar a seleção limitada de logs, priorizando erros e o contexto temporal relevante.
2. `CONCLUÍDO` — implementar a exportação compacta do contexto do incidente e a skill versionada de RCA.
3. `PENDENTE` — gerar e avaliar o primeiro RCA assistido usando um incidente controlado do Connect e seu checkout local.
4. Adicionar traces em uma iteração posterior e comparar objetivamente a qualidade do RCA com e sem essa fonte.

**Decisões:** DT-05, DT-06 e DT-13 concluídas pela DEC-015.

**Progresso em 2026-09-03:** a coleta do Loki passou a examinar um conjunto
limitado maior e selecionar primeiro erros e depois entradas próximas à detecção
do incidente, preservando a ordem cronológica e registrando estratégia,
quantidades e truncamento. O endpoint autenticado de operador
`POST /v1/incidents/:incidentId/rca-handoff` exporta um contrato v1 compacto e
sanitizado com incidente, ocorrências, severidade e o mesmo pacote de evidências
usado na classificação. O checkout permanece explicitamente fora do pacote.

**Evidências:** módulos `services/analyzer/src/rca-handoff` e
`services/analyzer/src/evidence/loki-source.ts`; contrato operacional em
`docs/rca-handoff.md`; 55 testes, typecheck e build aprovados. O endpoint foi
validado na stack local com o incidente
`87413356-d94b-46ca-a378-f3b28728487f`, retornando uma ocorrência, oito itens de
evidência e severidade `alta`; a seleção examinou 200 logs, reteve 50 e declarou
o truncamento. A skill `.agents/skills/incident-rca` e seu contrato de saída
Markdown foram
validados estruturalmente, incluindo a rejeição de severidade divergente e de
citações inexistentes. A execução avaliada do primeiro RCA ainda está pendente.

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

| Risco                                              | Consequência                                  | Mitigação inicial                                                                   |
| -------------------------------------------------- | --------------------------------------------- | ----------------------------------------------------------------------------------- |
| Alerta não contém contexto suficiente              | RCA genérico ou incorreto                     | Buscar evidências nas fontes e permitir resultado inconclusivo                      |
| Correlação incorreta                               | Mistura de incidentes diferentes              | Incluir serviço, ambiente e identidade do alerta na chave                           |
| Alucinação do modelo                               | Ação humana baseada em informação falsa       | Exigir evidências, confiança, limitações e validação estrutural                     |
| Prompt injection por logs                          | Desvio da análise ou exposição de dados       | Tratar logs como dados não confiáveis e limitar ferramentas/permissões              |
| Dados sensíveis enviados ao provedor               | Incidente de segurança ou privacidade         | Sanitização, allowlist de campos e política de retenção                             |
| Excesso de notificações                            | Canal ignorado pelos operadores               | Deduplicação, cooldown e política de roteamento                                     |
| n8n concentrar regras de negócio                   | Baixa testabilidade e difícil evolução        | Manter contratos e regras centrais no Analyzer, caso n8n seja adotado               |
| Classificação baseada apenas no texto              | Severidade incompatível com impacto real      | Combinar regras, metadados de serviço e sinais objetivos                            |
| Alloy com acesso ao socket Docker                  | Comprometimento do coletor pode afetar o host | Restringir à PoC local; em produção usar coleta isolada e menor privilégio          |
| Buffer assíncrono de logs perdido em queda abrupta | Últimas linhas podem não chegar ao coletor    | Flush no encerramento gracioso; aceitar a limitação para `SIGKILL` ou falha do host |

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

### DEC-007 — Persistência com Effect SQL

- **Data:** 2026-08-28
- **Estado:** aceita
- **Contexto:** o histórico precisa ser reproduzível e auditável sem introduzir um ORM ou expandir excessivamente a superfície técnica da PoC.
- **Decisão:** usar `@effect/sql-pg`, migrations TypeScript com SQL explícito e persistir somente o contrato interno sanitizado; o webhook bruto não será armazenado por padrão.
- **Alternativas consideradas:** Drizzle; `pg` direto; persistência do corpo bruto.
- **Consequências:** queries, transações e falhas integram-se ao Effect; o schema físico permanece visível; mudanças exigem migrations incrementais; correlação fica no CP-06.
- **Checkpoints afetados:** CP-05 e CP-06.

### DEC-008 — Codebase remota como fonte de evidência

- **Data:** 2026-08-28
- **Estado:** substituída pela DEC-015
- **Contexto:** um RCA útil pode precisar confrontar logs e métricas com o código realmente executado pelo serviço.
- **Decisão:** consultar um provedor remoto por um adapter read-only controlado, sempre que possível na revisão implantada; o modelo não poderia executar comandos CLI arbitrários.
- **Alternativas consideradas:** não consultar código; usar sempre a branch principal; entregar um shell irrestrito ao modelo.
- **Consequências:** evidências poderão citar repositório, commit, arquivo e linhas; será necessário mapear serviço para repositório/revisão e fornecer uma credencial mínima de leitura.
- **Checkpoints afetados:** CP-07, CP-09 e CP-10.

### DEC-009 — Effect como interface e Pino como sink de logs

- **Data:** 2026-08-28
- **Estado:** aceita
- **Contexto:** o Analyzer precisa propagar contexto pelas fibers sem realizar serialização e escrita síncrona no caminho das requisições.
- **Decisão:** casos de uso emitem por `Effect.log*`; um adapter traduz níveis, annotations, spans e causas para uma única instância Pino com destino assíncrono em `stdout`; Fastify reutiliza a mesma instância para logs internos.
- **Alternativas consideradas:** logger JSON padrão do Effect sobre `console.log`; `Logger.batched`; Pino chamado diretamente pelos casos de uso.
- **Consequências:** domínio não depende de Pino, todos os logs usam JSON consistente e o buffer é descarregado no encerramento gracioso; uma queda abrupta ainda pode perder as últimas mensagens em memória.
- **Checkpoints afetados:** CP-05, CP-09 e CP-13.

### DEC-010 — Persistência de eventos atrás de um seam

- **Data:** 2026-08-28
- **Estado:** aceita
- **Contexto:** o handler de ingestão precisa persistir e consultar eventos sem conhecer SQL, transações ou detalhes do PostgreSQL.
- **Decisão:** definir a interface `EventStore` com `record` e `findByEventId`; usar adapter PostgreSQL em execução e adapter em memória nos testes; reconhecer conflito de `event_id` como duplicata aceita.
- **Alternativas consideradas:** SQL diretamente no handler; mock de queries; transformar duplicata em erro HTTP.
- **Consequências:** a interface é o test surface, persistência em grupo é transacional e o Grafana recebe `503` apenas quando a durabilidade não pode ser garantida.
- **Checkpoints afetados:** CP-05 e CP-06.

### DEC-011 — Identidade e ciclo de vida persistido do incidente

- **Data:** 2026-08-31
- **Estado:** substituída pela DEC-013
- **Contexto:** o CP-06 precisava correlacionar eventos repetidos sem agrupar alertas diferentes nem permitir que uma resolução atrasada encerrasse uma ocorrência mais nova.
- **Decisão:** representar cada ocorrência como um incidente; calcular `correlation_key` a partir da identidade canônica da instância; identificar a ocorrência por `correlation_key + started_at`; usar os estados `open`, `resolved` e `closed_unconfirmed`; registrar `firing_observed`; serializar alterações da mesma instância e impor unicidade no banco.
- **Alternativas consideradas:** agrupar alertas distintos por janela temporal; usar somente o fingerprint; manter `first_seen_at` e `last_seen_at`; ignorar resoluções sem disparo previamente observado.
- **Consequências:** eventos fora de ordem preservam o histórico correto; incidentes reconstruídos ficam explícitos; cada evento pertence a uma única ocorrência; correlação causal entre alertas distintos permanece fora desta etapa.
- **Checkpoints afetados:** CP-06, CP-07, CP-09 e CP-11.

### DEC-012 — Severidade determinística e criticidade versionada

- **Data:** 2026-08-31
- **Estado:** aceita
- **Contexto:** a primeira entrega precisa classificar impacto de forma reproduzível e auditável antes de introduzir um modelo de IA.
- **Decisão:** adotar a taxonomia `informativa`, `baixa`, `media`, `alta`, `critica` e `inconclusiva`; manter criticidade e teto por ambiente em catálogo versionado; usar somente métricas objetivas para acionar severidade; tratar mudança recente como contexto não causal.
- **Alternativas consideradas:** usar a label textual do alerta; deixar a IA escolher a severidade; inferir causalidade pela proximidade de uma mudança; armazenar criticidade apenas no Grafana.
- **Consequências:** a mesma entrada produz a mesma decisão e cita regras/evidências; serviços ou ambientes não catalogados e sinais insuficientes ficam inconclusivos; mudanças no catálogo ou nos limiares passam por revisão de código.
- **Checkpoints afetados:** CP-08 e CP-10.

### DEC-013 — Ocorrências separadas de incidentes operacionais

- **Data:** 2026-08-31
- **Estado:** aceita
- **Contexto:** representar cada episódio de alerta como incidente fragmentava uma mesma falha em casos independentes e confundia encerramento do alerta com recuperação operacional.
- **Decisão:** eventos formam ocorrências; cada ocorrência pertence a exatamente um incidente por associação auditável; um incidente agrega uma ou mais ocorrências. A política v1 usa serviço, ambiente e janela de 10 minutos, associa somente diante de um único candidato e mantém o incidente aberto enquanto alguma ocorrência estiver aberta. Sem ocorrências abertas, o incidente fica `awaiting_confirmation`.
- **Alternativas consideradas:** manter um incidente por ocorrência; associar apenas manualmente; agrupar todo alerta aberto do mesmo serviço; permitir que a IA decida a associação.
- **Consequências:** um RCA pode analisar vários sintomas da mesma falha; associações ambíguas criam outro incidente em vez de misturar casos; o fechamento do alerta não declara recuperação; a política permanece conservadora, versionada e auditável.
- **Checkpoints afetados:** CP-06, CP-07, CP-08, CP-09 e CP-11.

### DEC-014 — Encerramento operacional explícito e terminal

- **Data:** 2026-09-01
- **Estado:** aceita
- **Contexto:** a resolução de todas as ocorrências remove os sinais ativos, mas não comprova por si só que o acompanhamento operacional pode terminar. O Analyzer também precisa impedir que a credencial de ingestão represente falsamente uma decisão humana.
- **Decisão:** manter o incidente em `awaiting_confirmation` após o último sinal; permitir fechamento manual somente nesse estado, usando credencial própria de operador e auditoria obrigatória. `closed` é terminal: eventos atrasados podem completar ocorrências, mas não reabrem o incidente; uma falha posterior inicia outro incidente. O mesmo comando de fechamento é idempotente e um comando divergente não substitui a auditoria existente.
- **Alternativas consideradas:** fechar imediatamente no último `resolved`; fechar apenas por tempo sem sinais; permitir fechamento enquanto houver ocorrências abertas; reutilizar a credencial do Grafana; reabrir o mesmo incidente após `closed`.
- **Consequências:** resolução técnica e decisão operacional permanecem distintas; o fechamento possui autoria verificável; recorrências posteriores preservam a história anterior em outro incidente; uma política automática futura precisará comprovar recuperação e registrar sua versão.
- **Checkpoints afetados:** CP-06, CP-09, CP-10 e CP-11.

### DEC-015 — Handoff manual para o agente de RCA

- **Data:** 2026-09-02
- **Estado:** aceita
- **Contexto:** acoplar o Analyzer a um provedor remoto exigia credencial, catálogo de repositórios e identificação confiável da revisão implantada antes de haver uma necessidade comprovada de automação. Para a etapa atual, o operador já pode escolher o repositório correto e supervisionar a análise.
- **Decisão:** o Analyzer produzirá apenas o contexto observável e a severidade do incidente. O operador entregará esse pacote a um agente por meio de uma skill e apontará separadamente um checkout local. O acesso ao código pertence à sessão do agente, não ao runtime do Analyzer nem ao contrato de evidências.
- **Alternativas consideradas:** manter o adapter remoto; clonar automaticamente a branch principal; informar a revisão no build; gerar o RCA diretamente pelo Analyzer.
- **Consequências:** desaparecem as credenciais e configurações de repositório no Analyzer e não há acoplamento com revisão de build. O RCA permanece deliberadamente manual; a fidelidade do checkout passa a ser responsabilidade explícita do operador, e a automação futura só será retomada quando houver uma fonte confiável de proveniência de deployment.
- **Checkpoints afetados:** CP-07, CP-09, CP-10 e CP-13.

### DEC-016 — Perfis de serviço e sinais de impacto normalizados

- **Data:** 2026-09-02
- **Estado:** aceita
- **Contexto:** eventos e incidentes já eram independentes da aplicação de demonstração, mas a coleta e a severidade conheciam diretamente métricas `checkout_*`. Integrar outro serviço exigiria editar o núcleo do Analyzer.
- **Decisão:** cadastrar criticidade, teto e consultas de impacto por `service + environment` em arquivo externo versionado. O adapter Prometheus rotula cada resultado pelo significado operacional; um módulo o converte em sinais normalizados, e somente esses sinais entram no classificador. Para OTLP, `service.name` e `deployment.environment.name` são normalizados para a identidade canônica do incidente.
- **Alternativas consideradas:** exigir que todos os serviços renomeiem suas métricas; manter um classificador por serviço; aceitar PromQL enviado no webhook; classificar apenas pelo texto do alerta.
- **Consequências:** a checkout continua suportada por seu perfil e outros serviços podem entrar por configuração; as consultas são configuração operacional confiável e exigem restart; métricas delta precisam ser convertidas antes do exporter Prometheus estável da PoC; ausência de perfil ou sinal permanece explícita e inconclusiva.
- **Checkpoints afetados:** CP-07, CP-08, CP-09 e CP-13.

## Histórico de atualizações

| Data       | Alteração                                                                                                                                                                          | Responsável |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| 2026-08-27 | Criação da fonte da verdade, requisitos e checkpoints iniciais.                                                                                                                    | Codex       |
| 2026-08-27 | CP-00 iniciado com cenários e métricas propostos para discussão.                                                                                                                   | Codex       |
| 2026-08-27 | CP-00 concluído; CP-01 iniciado com stack e credenciais propostas.                                                                                                                 | Codex       |
| 2026-08-27 | TypeScript aprovado; Effect e notificação direta registrados para discussão.                                                                                                       | Codex       |
| 2026-08-27 | CP-01 concluído com n8n removido e notificação direta aprovada.                                                                                                                    | Codex       |
| 2026-08-27 | CP-02 concluído com ambiente local reproduzível e seis serviços saudáveis.                                                                                                         | Codex       |
| 2026-08-27 | CP-03 dividido em entregas menores; CP-03A concluído com falha controlável.                                                                                                        | Codex       |
| 2026-08-27 | CP-03A.1 concluído com Fastify nas duas bordas HTTP.                                                                                                                               | Codex       |
| 2026-08-27 | CP-03B concluído com logs estruturados coletados pelo Alloy e consultados no Loki.                                                                                                 | Codex       |
| 2026-08-27 | CP-03 e CP-03C concluídos com métricas coletadas e consultadas através do Grafana.                                                                                                 | Codex       |
| 2026-08-27 | Logs automáticos de requests removidos; eventos semânticos preservados.                                                                                                            | Codex       |
| 2026-08-27 | CP-04 iniciado; CP-04A concluído com schemas e fixtures testados.                                                                                                                  | Codex       |
| 2026-08-28 | CP-04B concluído com ingestão autenticada e normalização all-or-nothing.                                                                                                           | Codex       |
| 2026-08-28 | CP-04 e CP-04C concluídos com alerta real firing/resolved entregue pelo Grafana.                                                                                                   | Codex       |
| 2026-08-28 | CP-05 iniciado; CP-05A registra o modelo mínimo de persistência para auditoria.                                                                                                    | Codex       |
| 2026-08-28 | CP-05A e CP-05B concluídos com schema PostgreSQL e migrations idempotentes.                                                                                                        | Codex       |
| 2026-08-28 | Logs do Analyzer padronizados em Effect com sink Pino assíncrono e flush gracioso.                                                                                                 | Codex       |
| 2026-08-28 | CP-05 e CP-05C concluídos com persistência, idempotência e consulta de eventos.                                                                                                    | Codex       |
| 2026-08-28 | CP-06A iniciado; incidentes permanecem separados por ocorrência e resolução órfã reconstrói um incidente parcial.                                                                  | Codex       |
| 2026-08-28 | CP-06A concluído com identidade, estados e casos-limite aprovados; CP-06B aberto para auditoria do schema.                                                                         | Codex       |
| 2026-08-31 | CP-06 concluído com modelo persistido, correlação transacional, ciclo de vida, consulta e testes de eventos fora de ordem.                                                         | Codex       |
| 2026-08-31 | CP-07 concluído com pacote limitado e sanitizado de alertas, métricas e logs, tolerando falhas parciais.                                                                           | Codex       |
| 2026-08-31 | CP-08 iniciado como marco da entrega atual; auditoria identificou sinais ausentes para reproduzir CV-03 com responsabilidade.                                                      | Codex       |
| 2026-08-31 | CP-08 e a primeira entrega concluídos com severidade determinística, catálogo versionado e CV-01 a CV-03 testados.                                                                 | Codex       |
| 2026-08-31 | CP-06D concluiu a migração 1:N entre incidentes e ocorrências, preservando dados e validando agregação real no PostgreSQL.                                                         | Codex       |
| 2026-09-01 | CP-06E concluiu o fechamento manual auditável, com credencial de operador separada e estado `closed` terminal.                                                                     | Codex       |
| 2026-09-02 | Integração direta com repositório removida; RCA seguirá por handoff manual para um agente com checkout local explícito.                                                            | Codex       |
| 2026-09-02 | Coleta e severidade generalizadas por perfil de serviço e sinais de impacto; entrada OTLP preparada para serviços externos.                                                        | Codex       |
| 2026-09-02 | Connect integrado localmente via OTLP com logs, métricas cumulativas, alerta firing/resolved, incidente, severidade alta por indisponibilidade e fechamento operacional validados. | Codex       |
| 2026-09-03 | CP-09 iniciado com seleção priorizada de logs e exportação compacta e autenticada do contexto para o handoff manual de RCA.                                                        | Codex       |
| 2026-09-03 | Skill `incident-rca` versionada com fronteira de confiança, contrato estruturado e validação determinística de evidências e referências de código.                                          | Codex       |
