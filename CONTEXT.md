# Observabilidade de Incidentes

Este contexto descreve como sinais recebidos do Grafana se tornam casos operacionais auditáveis antes de qualquer análise de causa.

## Language

**Instância de alerta**:
Alerta individual produzido por uma regra para um conjunto específico de labels ou dimensão monitorada.
_Avoid_: Regra de alerta, incidente

**Evento de alerta**:
Fato imutável aceito do Grafana sobre o estado de uma instância de alerta em determinado momento, como `firing` ou `resolved`.
_Avoid_: Incidente, ocorrência

**Ocorrência de alerta**:
Episódio contínuo de ativação de uma única instância de alerta, formado por um ou mais eventos desde `firing` até `resolved`.
_Avoid_: Evento, notificação, incidente

**Incidente**:
Caso operacional acompanhado pelo Analyzer que reúne uma ou mais ocorrências de alerta relacionadas. Seu ciclo de vida não equivale ao ciclo de nenhum alerta individual.
_Avoid_: Evento, alerta do Grafana

**Associação de ocorrência**:
Vínculo auditável entre uma ocorrência de alerta e o incidente operacional ao qual ela fornece evidência.
_Avoid_: Causalidade, agrupamento de eventos

**Associação provisória**:
Associação sustentada por pelo menos uma ocorrência ainda aberta e que pode ser revista quando um evento posterior delimitar seu intervalo real.
_Avoid_: Associação definitiva, causalidade presumida

**Escopo de correlação**:
Identidade operacional compartilhada por ocorrências que podem pertencer ao mesmo incidente. Compatibilidade de escopo permite associação, mas não afirma causalidade.
_Avoid_: Causa raiz, assinatura de erro, serviço

**Ocorrência reconstruída**:
Ocorrência conhecida inicialmente por um evento `resolved`, sem que o Analyzer tenha observado antes seu `firing`; seu ciclo de vida é explicitamente parcial.
_Avoid_: Ocorrência inválida, evento órfão

**Encerramento não confirmado**:
Fim atribuído a uma ocorrência quando uma nova ocorrência da mesma instância começa sem que o Analyzer tenha recebido a resolução da anterior.
_Avoid_: Resolução, recuperação

**Incidente aguardando confirmação**:
Incidente sem ocorrências de alerta abertas conhecidas, mas cuja recuperação operacional ainda não foi confirmada.
_Avoid_: Incidente resolvido, sistema recuperado, causa corrigida

**Incidente encerrado**:
Incidente anteriormente aguardando confirmação cujo acompanhamento foi finalizado explicitamente por uma pessoa ou política operacional. Seu encerramento é terminal, não afirma que a causa raiz foi descoberta e não é revertido por eventos atrasados; uma nova falha inicia outro incidente.
_Avoid_: Alerta resolvido, sinais encerrados, RCA concluído

**Exclusão operacional**:
Ação explícita de operador que retira um incidente encerrado das consultas e interfaces operacionais sem apagar suas ocorrências, eventos ou dados de encerramento. É idempotente e não reabre nem altera a conclusão registrada.
_Avoid_: Exclusão física, limpeza do banco, reabertura

**Contexto do incidente**:
Pacote sanitizado com o incidente, suas ocorrências, evidências observáveis e classificação determinística. Não contém código, credenciais de repositório nem uma conclusão de causa raiz.
_Avoid_: RCA, snapshot do repositório, prompt

**Handoff de RCA**:
Ato explícito em que o operador entrega o contexto do incidente a um agente e aponta, separadamente, o checkout local que pode ser consultado. O estado desse checkout é uma entrada declarada pelo operador, não algo inferido pelo Analyzer.
_Avoid_: Coleta automática de código, evidência do Analyzer

**Revisão observada de deployment**:
Identificador de versão declarado pela telemetria de uma instância do serviço durante a janela do incidente. Uma revisão imutável tem precedência sobre branch ou tag; a presença de várias revisões representa explicitamente a coexistência observada e não é reduzida a uma única versão.
_Avoid_: Revisão confirmada, código do incidente, branch implantada

**Correspondência do checkout**:
Relação entre o HEAD do checkout fornecido pelo operador e as revisões observadas de deployment. Pode ser exata, divergente, múltipla ou desconhecida; não afirma que alterações locais não commitadas estavam implantadas.
_Avoid_: Checkout implantado, código confirmado, causa comprovada

**Revisão de código analisada**:
Commit cujos arquivos fundamentam as afirmações e citações de código do RCA assistido. Quando uma única revisão observada de deployment está disponível no repositório local, ela é preferida ao HEAD do checkout sem exigir troca de branch; caso contrário, o HEAD pode ser usado apenas com a limitação de correspondência explícita.
_Avoid_: Branch analisada, working tree implantado, revisão inferida

**RCA assistido**:
Análise produzida por um agente a partir do contexto do incidente e do checkout disponibilizado pelo operador. Deve separar observações, hipóteses e limitações; não altera o ciclo de vida do incidente por si só.
_Avoid_: Severidade determinística, encerramento do incidente

**Perfil de serviço**:
Cadastro operacional que informa como interpretar os sinais de um serviço em cada ambiente, incluindo criticidade, teto de severidade e consultas de impacto disponíveis. Não representa o repositório nem uma instância em execução.
_Avoid_: Repositório, deployment, instância de serviço

**Sinal de impacto**:
Medida normalizada do efeito operacional observado durante um incidente, como requisições totais, falhas, disponibilidade ou duração da falha. Sua origem pode variar entre serviços sem alterar as regras que a interpretam.
_Avoid_: Nome de métrica, alerta, causa raiz
