# Identidade e resolução de alertas no webhook do Grafana

Pesquisa realizada em 2026-08-28 para orientar a associação entre eventos `firing`, eventos `resolved` e incidentes da PoC.

## Fatos confirmados

- Uma regra pode produzir várias instâncias de alerta, uma para cada série ou dimensão, e essas instâncias podem ter estados diferentes. [Grafana Alerting fundamentals](https://grafana.com/docs/grafana/latest/alerting/fundamentals/)
- O conjunto de labels identifica uma instância, e a referência oficial descreve `Fingerprint` como uma string única que identifica o alerta. [Notification template reference](https://grafana.com/docs/grafana/latest/alerting/configure-notifications/template-notifications/reference/)
- O Grafana encaminha uma instância quando ela entra em `Alerting` e quando volta a `Normal` marcada como `Resolved`; `Keep firing for` controla uma etapa intermediária de recuperação. [Alert rule evaluation](https://grafana.com/docs/grafana/latest/alerting/fundamentals/alert-rule-evaluation/)
- O webhook contém `status`, `startsAt`, `endsAt` e `fingerprint` por alerta. `groupKey` identifica o agrupamento da notificação, não uma ocorrência individual. [Webhook notifier](https://grafana.com/docs/grafana/latest/alerting/configure-notifications/manage-contact-points/integrations/webhook-notifier/)
- Notificações de resolução podem ser desabilitadas no contact point; o Analyzer não pode fechar incidentes pelo webhook se essa opção estiver ativa. [Webhook notifier](https://grafana.com/docs/grafana/latest/alerting/configure-notifications/manage-contact-points/integrations/webhook-notifier/)
- Uma série ausente também pode levar uma instância ativa a `Resolved`, com `grafana_state_reason=MissingSeries`; isso não prova recuperação do sistema. [Stale alert instances](https://grafana.com/docs/grafana/latest/alerting/fundamentals/alert-rule-evaluation/stale-alert-instances/)
- O Grafana não envia um enum de resolução equivalente a `recovered | missing_series | unknown`. O campo do alerta permanece `status=resolved`; em transições especiais, a annotation opcional `grafana_state_reason` explica razões como `MissingSeries`, `No Data`, `Error`, `Paused`, `RuleDeleted` ou `Updated`. Uma recuperação normal geralmente não traz essa annotation. [No Data and Error states](https://grafana.com/docs/grafana/latest/alerting/fundamentals/alert-rule-evaluation/nodata-and-error-states/)

## Limitação relevante

O Grafana registrou uma regressão na versão 12.0.0 em que o `startsAt` do evento `resolved` podia ser substituído pelo `endsAt`. Portanto, `startsAt` isoladamente não é uma identidade segura entre versões. [Issue oficial grafana/grafana](https://github.com/grafana/grafana/issues/106065)

A PoC está fixada em Grafana 13.2.0 e já observou localmente o mesmo `startsAt` nos eventos `firing` e `resolved`, mas essa observação local não deve virar uma garantia universal para homologação.

## Recomendação para a PoC

1. Identificar a instância pelo `fingerprint`, protegido pelo identificador da origem, ambiente, serviço e nome do alerta.
2. Permitir no máximo um incidente aberto por essa identidade.
3. Usar `startsAt` como verificação do episódio, não como único identificador.
4. Ao receber `resolved`, fechar apenas o incidente aberto da mesma instância quando os timestamps forem compatíveis.
5. Se existir conflito de timestamps, persistir o evento e registrar uma inconsistência, sem fechar automaticamente um possível episódio mais novo.
6. Não usar `groupKey` nesta etapa, pois alertas diferentes permanecerão em incidentes separados.
7. Por decisão de escopo da PoC, qualquer evento `resolved` compatível encerra o incidente. O valor bruto de `grafana_state_reason` continua preservado nas annotations já persistidas, mas não gera uma categoria interna nem altera o ciclo de vida.
