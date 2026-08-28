export const firingWebhookFixture = {
  receiver: "grafana-ai-analyzer",
  status: "firing",
  alerts: [
    {
      status: "firing",
      labels: {
        alertname: "CheckoutFailureRateHigh",
        service: "checkout-api",
        environment: "local",
        severity: "warning"
      },
      annotations: {
        summary: "Checkout failure rate is above the configured threshold"
      },
      startsAt: "2026-08-27T15:00:00Z",
      endsAt: "0001-01-01T00:00:00Z",
      generatorURL: "http://grafana:3000/alerting/grafana/example/view",
      fingerprint: "fixture-checkout-failure",
      silenceURL: "http://grafana:3000/alerting/silence/new",
      dashboardURL: "http://grafana:3000/d/checkout/checkout-api",
      panelURL: "http://grafana:3000/d/checkout/checkout-api?viewPanel=1",
      values: {
        failure_rate: 0.5
      }
    }
  ],
  groupLabels: {
    alertname: "CheckoutFailureRateHigh"
  },
  commonLabels: {
    service: "checkout-api",
    environment: "local"
  },
  commonAnnotations: {
    summary: "Checkout failure rate is above the configured threshold"
  },
  externalURL: "http://grafana:3000/",
  version: "1",
  groupKey: "{}:{alertname=\"CheckoutFailureRateHigh\"}",
  truncatedAlerts: 0,
  orgId: 1,
  title: "[FIRING:1] CheckoutFailureRateHigh",
  state: "alerting",
  message: "Checkout failure rate is above the configured threshold"
} as const

export const resolvedWebhookFixture = {
  ...firingWebhookFixture,
  status: "resolved",
  alerts: [
    {
      ...firingWebhookFixture.alerts[0],
      status: "resolved",
      endsAt: "2026-08-27T15:10:00Z"
    }
  ],
  title: "[RESOLVED] CheckoutFailureRateHigh",
  state: "ok"
} as const
