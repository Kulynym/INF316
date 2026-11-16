// Next.js server start hook. OpenTelemetry (traces, metrics, logs) starts
// only when an OTLP endpoint is configured, so local runs and tests without
// a collector send nothing. Standard OTEL_* variables configure the exporters.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.OTEL_EXPORTER_OTLP_ENDPOINT)
    await import("./server/telemetry/sdk");
}
