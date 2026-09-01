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
