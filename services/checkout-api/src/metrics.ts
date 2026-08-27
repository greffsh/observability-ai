import { Counter, Gauge, Histogram, Registry } from "@prometheus-io/client"

export const createMetrics = (service: string, environment: string) => {
  const registry = new Registry()
  registry.setDefaultLabels({ service, environment })

  const checkoutRequests = new Counter({
    name: "checkout_requests_total",
    help: "Total number of simulated checkout operations.",
    labelNames: ["outcome", "http_status"],
    registers: [registry]
  })

  const checkoutDuration = new Histogram({
    name: "checkout_request_duration_seconds",
    help: "Duration of simulated checkout operations in seconds.",
    labelNames: ["outcome"],
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1],
    registers: [registry]
  })

  const failureMode = new Gauge({
    name: "checkout_failure_mode",
    help: "Whether the deterministic checkout failure mode is enabled.",
    registers: [registry]
  })

  failureMode.set(0)

  return {
    contentType: registry.contentType,
    recordCheckout: (outcome: "success" | "failure", httpStatus: 200 | 503, duration: number) => {
      checkoutRequests.inc({ outcome, http_status: String(httpStatus) })
      checkoutDuration.observe({ outcome }, duration)
    },
    setFailureMode: (enabled: boolean) => failureMode.set(enabled ? 1 : 0),
    render: () => registry.metrics()
  }
}
