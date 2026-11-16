// Minimal OTLP/HTTP (JSON) receiver for checking the app's telemetry without
// a collector: stores every export it receives and serves a summary.
//   node scripts/otlp-capture.mjs [port]      (default 4318)
//   GET /summary -> { spans, metrics, logs } names seen so far
// Run the app with OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:<port>
// and OTEL_EXPORTER_OTLP_PROTOCOL=http/json.
import { createServer } from "node:http";

const port = Number(process.argv[2] || 4318);
const seen = { spans: [], metrics: new Map(), logs: [], resources: new Map() };

const attrs = (list = []) =>
  Object.fromEntries(list.map((a) => [a.key, Object.values(a.value ?? {})[0]]));

createServer(async (request, response) => {
  if (request.method === "GET" && request.url === "/summary") {
    response.writeHead(200, { "Content-Type": "application/json" });
    return response.end(JSON.stringify({
      resources: Object.fromEntries(seen.resources),
      spans: seen.spans.slice(-200),
      metrics: Object.fromEntries(seen.metrics),
      logs: seen.logs.slice(-200),
    }, null, 1));
  }
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  for (const r of body.resourceSpans ?? []) {
    seen.resources.set("traces", attrs(r.resource?.attributes));
    for (const s of r.scopeSpans ?? [])
      for (const span of s.spans ?? [])
        seen.spans.push({ name: span.name, traceId: span.traceId, status: span.status?.code ?? 0, attributes: attrs(span.attributes) });
  }
  for (const r of body.resourceMetrics ?? []) {
    seen.resources.set("metrics", attrs(r.resource?.attributes));
    for (const s of r.scopeMetrics ?? [])
      for (const metric of s.metrics ?? []) {
        const data = metric.sum ?? metric.gauge ?? metric.histogram;
        const points = (data?.dataPoints ?? []).map((p) => ({
          attributes: attrs(p.attributes),
          value: p.asInt ?? p.asDouble ?? p.count,
        }));
        seen.metrics.set(metric.name, { unit: metric.unit, points });
      }
  }
  for (const r of body.resourceLogs ?? [])
    for (const s of r.scopeLogs ?? [])
      for (const log of s.logRecords ?? [])
        seen.logs.push({ severity: log.severityText, body: log.body?.stringValue, traceId: log.traceId, attributes: attrs(log.attributes) });
  response.writeHead(200, { "Content-Type": "application/json" });
  response.end("{}");
}).listen(port, "127.0.0.1", () => console.log(`otlp capture on ${port}`));
