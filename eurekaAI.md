## EUREKA TALKS - GRAFANA

> Anotações originais de contexto. A fonte da verdade de requisitos, decisões e
> progresso da PoC é [CHECKPOINTS.md](CHECKPOINTS.md).

- Detecta (sinal)
- Explica (RCA assistido por IA com evidências)
- Decida (humano decide)

Grafana (detecta) -> Analyzer (explica + classifica) -> Hub (opera) Nexus? -> Pessoa (aprova e corriga)

## Camada de Sinais

- logs com nível de error
- alerta grafana (ou equivalente)
- trace open telemtry (quando houver, ver o caminho da request)
- identidade do serviço (não misturar incidentes)

## Camada de Análise

1. recebe alerta e deduplica
2. junta mensagem, stack e contexto
3. gera relatório RCA (root cause analysis)
4. escolhe modelo conforme necessidade
5. registra tokens para custo visivel
6. abre tarefa no portal e avisa chat (em aberto)

## Camada de Operações - onde o colaborador age

- home de pendências e lista de incidentes
- filtro por impacto e detalhes RCA
- link tarefa do portal
- actions: resolver, ignorar, reanalisar
- métricas de uso da IA
- login e papéis

### Notificações com responsabilidade

- possível ruido -> chat geral
- serviço parado -> aviso cedo + chat de emergência
- resolver no hub também resolve no portal
