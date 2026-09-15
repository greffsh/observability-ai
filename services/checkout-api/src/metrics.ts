import { Counter, Gauge, Registry } from "@prometheus-io/client"

export const createMetrics = (service: string, environment: string) => {
  const registry = new Registry()
  registry.setDefaultLabels({ service, environment })

  const checkoutRequests = new Counter({
    name: "checkout_requests_total",
    help: "Total number of simulated checkout operations.",
    labelNames: ["outcome", "http_status"],
    registers: [registry]
  })

  const availability = new Gauge({
    name: "checkout_availability",
    help: "Whether checkout-api is available to serve traffic.",
    registers: [registry]
  })

  checkoutRequests.inc({ outcome: "success", http_status: "200" }, 0)
  checkoutRequests.inc({ outcome: "failure", http_status: "503" }, 0)
  availability.set(1)

  return {
    contentType: registry.contentType,
    recordCheckout: (outcome: "success" | "failure", httpStatus: 200 | 503) => {
      checkoutRequests.inc({ outcome, http_status: String(httpStatus) })
    },
    setAvailability: (available: boolean) => availability.set(available ? 1 : 0),
    render: () => registry.metrics()
  }
}
