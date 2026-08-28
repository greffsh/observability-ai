export const firingWebhookFixture = {
  receiver: "Analyzer webhook bearer",
  status: "firing",
  alerts: [
    {
      status: "firing",
      labels: {
        alertname: "Checkout failure mode enabled",
        environment: "local",
        grafana_folder: "Grafana AI PoC",
        service: "checkout-api",
        severity: "warning"
      },
      annotations: {
        description: "The deterministic failure mode for checkout-api is active.",
        summary: "Checkout failure mode is enabled"
      },
      startsAt: "2026-08-28T13:21:00Z",
      endsAt: "0001-01-01T00:00:00Z",
      generatorURL: "http://localhost:3000/alerting/grafana/checkout-failure-mode-enabled/view?orgId=1",
      fingerprint: "fixture-checkout-failure",
      silenceURL: "http://localhost:3000/alerting/silence/new?alertmanager=grafana",
      dashboardURL: "",
      panelURL: "",
      ruleUID: "checkout-failure-mode-enabled",
      values: {
        B0: 1
      },
      valueString: "[ var='B0' metric='checkout_failure_mode' value=1 ]",
      orgId: 1
    }
  ],
  groupLabels: {
    alertname: "Checkout failure mode enabled",
    grafana_folder: "Grafana AI PoC"
  },
  commonLabels: {
    alertname: "Checkout failure mode enabled",
    service: "checkout-api",
    environment: "local",
    grafana_folder: "Grafana AI PoC",
    severity: "warning"
  },
  commonAnnotations: {
    description: "The deterministic failure mode for checkout-api is active.",
    summary: "Checkout failure mode is enabled"
  },
  externalURL: "http://localhost:3000/",
  appVersion: "13.2.0",
  version: "1",
  groupKey: "{}:{alertname=\"Checkout failure mode enabled\", grafana_folder=\"Grafana AI PoC\"}",
  truncatedAlerts: 0,
  orgId: 1,
  title: "[FIRING:1] Checkout failure mode enabled Grafana AI PoC",
  state: "alerting",
  message: "Synthetic checkout failure alert"
} as const

export const resolvedWebhookFixture = {
  ...firingWebhookFixture,
  status: "resolved",
  alerts: [
    {
      ...firingWebhookFixture.alerts[0],
      status: "resolved",
      endsAt: "2026-08-28T13:31:00Z"
    }
  ],
  title: "[RESOLVED] Checkout failure mode enabled",
  state: "ok"
} as const
