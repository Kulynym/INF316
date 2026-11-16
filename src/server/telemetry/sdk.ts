// OpenTelemetry SDK for the Node.js server: traces (HTTP + PostgreSQL
// auto-instrumentation and our action spans), metrics (src/server/telemetry/
// metrics.ts) and logs, all exported over OTLP/HTTP to the collector named by
// OTEL_EXPORTER_OTLP_ENDPOINT (deploy/observability/otel-collector.yaml).
import { NodeSDK } from "@opentelemetry/sdk-node";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { BatchLogRecordProcessor } from "@opentelemetry/sdk-logs";
import { HttpInstrumentation } from "@opentelemetry/instrumentation-http";
import { PgInstrumentation } from "@opentelemetry/instrumentation-pg";
import { appEnvironment } from "./environment";

const sdk = new NodeSDK({
  serviceName: process.env.OTEL_SERVICE_NAME || "maxball",
  resource: resourceFromAttributes({
    "service.version": process.env.APP_VERSION || "dev",
    "deployment.environment.name": appEnvironment(),
  }),
  traceExporter: new OTLPTraceExporter(),
  metricReaders: [
    new PeriodicExportingMetricReader({
      exporter: new OTLPMetricExporter(),
      exportIntervalMillis: Number(process.env.OTEL_METRIC_EXPORT_INTERVAL || 15000),
    }),
  ],
  logRecordProcessors: [new BatchLogRecordProcessor({ exporter: new OTLPLogExporter() })],
  instrumentations: [
    new HttpInstrumentation({
      // Static assets would drown the request traces that matter.
      ignoreIncomingRequestHook: (request) => Boolean(request.url?.startsWith("/_next/")),
    }),
    new PgInstrumentation(),
  ],
});
sdk.start();

for (const signal of ["SIGTERM", "SIGINT"] as const)
  process.once(signal, () => void sdk.shutdown().finally(() => process.exit(0)));
