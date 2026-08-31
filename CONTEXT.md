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
Caso operacional acompanhado pelo Analyzer; nesta etapa, cada incidente corresponde a exatamente uma ocorrência de alerta e não agrupa alertas diferentes.
_Avoid_: Evento, alerta do Grafana

**Incidente reconstruído**:
Incidente conhecido inicialmente por um evento `resolved`, sem que o Analyzer tenha observado antes seu `firing`; seu ciclo de vida é explicitamente parcial.
_Avoid_: Incidente inválido, evento órfão

**Encerramento não confirmado**:
Fim atribuído a um incidente quando uma nova ocorrência da mesma instância começa sem que o Analyzer tenha recebido a resolução da ocorrência anterior.
_Avoid_: Resolução, recuperação

**Incidente resolvido**:
Incidente cuja instância de alerta foi informada como `resolved` pelo Grafana; o termo encerra o ciclo do alerta, sem afirmar recuperação completa do sistema.
_Avoid_: Sistema recuperado, causa corrigida
