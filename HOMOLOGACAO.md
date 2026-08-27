# Considerações para homologação

> Documento vivo. Registrar aqui diferenças entre a PoC local e uma futura
> implantação em homologação. Não representa autorização para implantar.

## Pontos principais

| Tema | Consideração para homologação | Estado |
|---|---|---|
| Stack existente | Reutilizar Grafana e datasources existentes; não presumir que Prometheus, Loki e Alloy locais serão implantados. | PENDENTE |
| Coleta de logs | Não reproduzir o acesso direto do Alloy a `/var/run/docker.sock`. Preferir o coletor já adotado pela plataforma ou envio OTLP com menor privilégio. | PENDENTE |
| Identidade Grafana | Usar service account restrita para o Analyzer; nunca armazenar credenciais de uma conta humana. | PENDENTE |
| Webhook | Expor o Analyzer por HTTPS e autenticar Grafana → Analyzer com segredo próprio, rotação e proteção contra replay. | PENDENTE |
| Rede | Validar DNS, certificados, firewall e tráfego de saída do Grafana para o Analyzer e do Analyzer para suas dependências. | PENDENTE |
| Segredos | Armazenar tokens, banco, modelo e canal em um gerenciador de segredos; não usar `.env` compartilhado. | PENDENTE |
| Dados e IA | Definir mascaramento, campos permitidos, retenção e quais logs podem ser enviados ao provedor de IA. | PENDENTE |
| Persistência | Definir PostgreSQL, migrations, backup, retenção e credencial exclusiva do Analyzer. | PENDENTE |
| Confiabilidade | Validar idempotência, deduplicação, retries, timeouts e comportamento quando Grafana, banco, datasources ou modelo falharem. | PENDENTE |
| Operação | Monitorar o próprio Analyzer, manter trilha de auditoria e definir responsável por suporte e rollback. | PENDENTE |
| Liberação | Começar com alerta sintético, canal restrito e modo sombra, sem ação automática. | PENDENTE |

## Informações a levantar

- [ ] Grafana Cloud ou self-hosted, versão e responsáveis.
- [ ] Datasources disponíveis para logs e métricas e respectivas permissões.
- [ ] Forma padrão da plataforma para coleta de telemetria.
- [ ] Ambiente onde Analyzer e PostgreSQL serão executados.
- [ ] Provedor de IA permitido e política de tratamento de dados.
- [ ] Canal de homologação e pessoas responsáveis pela auditoria.

## Condição mínima para iniciar

- [ ] Fluxo local completo aprovado.
- [ ] Ameaças e dados sensíveis revisados.
- [ ] Credenciais de máquina e conectividade validadas.
- [ ] Cenário sintético, critérios de aceite e rollback documentados.
