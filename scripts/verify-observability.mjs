// Proves the observability pipeline end to end against the compose stack
// (docker-compose.yml + docker-compose.observability.yml) after traffic was
// generated: metrics in Prometheus, logs in Loki, traces in Jaeger, the
// dashboard in Grafana, an alert fired through Alertmanager and the AI
// on-call agent's report. Run: node scripts/verify-observability.mjs
// Writes the agent's report to oncall-report.md for the CI summary.
import { writeFileSync } from "node:fs";

const PROM = process.env.PROMETHEUS_URL || "http://127.0.0.1:9090";
const LOKI = process.env.LOKI_URL || "http://127.0.0.1:3100";
const JAEGER = process.env.JAEGER_URL || "http://127.0.0.1:16686";
const AM = process.env.ALERTMANAGER_URL || "http://127.0.0.1:9093";
const GRAFANA = process.env.GRAFANA_URL || "http://127.0.0.1:3001";
const AGENT = process.env.ONCALL_URL || "http://127.0.0.1:8080";
const GRAFANA_AUTH = "Basic " + Buffer.from(`admin:${process.env.GRAFANA_ADMIN_PASSWORD || "admin"}`).toString("base64");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const json = async (url, init) => {
  const response = await fetch(url, init);
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response.json();
};
let failures = 0;
async function check(name, run, { timeoutSeconds = 180 } = {}) {
  const deadline = Date.now() + timeoutSeconds * 1000;
  let last;
  while (Date.now() < deadline) {
    try {
      const detail = await run();
      if (detail) {
        console.log(`PASS ${name}: ${detail}`);
        return;
      }
    } catch (error) {
      last = error.message;
    }
    await sleep(5000);
  }
  failures++;
  console.log(`FAIL ${name}${last ? `: ${last}` : ""}`);
}
const prom = async (query) => (await json(`${PROM}/api/v1/query?query=${encodeURIComponent(query)}`)).data.result;
const value = (result) => Number(result[0]?.value?.[1] ?? NaN);

await check("metrics: API actions counted with environment label", async () => {
  const r = await prom("sum by (environment) (maxball_actions_total)");
  return r.length && value(r) > 0 && r[0].metric.environment ? `${value(r)} actions, environment=${r[0].metric.environment}` : "";
});
await check("metrics: application-specific counters", async () => {
  const names = ["maxball_feedback_created_total", "maxball_logins_total", "maxball_comments_created_total", "maxball_action_duration_seconds_count", "maxball_feedback_open"];
  const found = [];
  for (const n of names) if ((await prom(`sum(${n})`)).length) found.push(n);
  return found.length === names.length ? found.join(", ") : "";
});
await check("metrics: health probe reports the app up", async () => {
  const r = await prom('max(httpcheck_status{http_status_class="2xx"})');
  return value(r) === 1 ? "httpcheck_status 2xx = 1" : "";
});
await check("logs: action logs in Loki carry trace ids", async () => {
  const end = Date.now() * 1e6;
  const url = `${LOKI}/loki/api/v1/query_range?query=${encodeURIComponent('{service_name="maxball"}')}&start=${end - 3600e9}&end=${end}&limit=50`;
  const streams = (await json(url)).data.result;
  const lines = streams.flatMap((s) => s.values);
  const withTrace = streams.filter((s) => s.stream.trace_id).length;
  return lines.length && withTrace ? `${lines.length} lines, ${withTrace} streams with trace_id` : "";
});
await check("traces: request traces of service maxball in Jaeger", async () => {
  const traces = (await json(`${JAEGER}/api/traces?service=maxball&lookback=1h&limit=50`)).data;
  const ops = new Set(traces.flatMap((t) => t.spans.map((s) => s.operationName)));
  const action = [...ops].find((o) => o.startsWith("action "));
  const db = [...ops].find((o) => o.startsWith("pg."));
  return traces.length && action && db ? `${traces.length} traces incl. "${action}" and "${db}"` : "";
});
await check("alerting: MaxballLoginFailureSpike fires in Prometheus", async () => {
  const alerts = (await json(`${PROM}/api/v1/alerts`)).data.alerts;
  const a = alerts.find((x) => x.labels.alertname === "MaxballLoginFailureSpike" && x.state === "firing");
  return a ? `firing, ${a.annotations.description}` : "";
});
await check("alerting: Alertmanager received the alert", async () => {
  const alerts = await json(`${AM}/api/v2/alerts`);
  return alerts.some((a) => a.labels.alertname === "MaxballLoginFailureSpike") ? "active in Alertmanager" : "";
});
let report;
await check("on-call: the AI agent investigated and wrote a report", async () => {
  const reports = await json(`${AGENT}/reports`);
  report = reports.find((r) => r.alertname === "MaxballLoginFailureSpike");
  return report ? `responder=${report.responder}, ${report.text.length} chars` : "";
}, { timeoutSeconds: 300 });
await check("dashboard: Grafana serves the provisioned MAXBALL dashboard", async () => {
  const headers = { Authorization: GRAFANA_AUTH };
  const dash = await json(`${GRAFANA}/api/dashboards/uid/maxball-app`, { headers });
  for (const uid of ["prometheus", "loki", "jaeger"]) {
    const health = await json(`${GRAFANA}/api/datasources/uid/${uid}/health`, { headers });
    if (health.status !== "OK") throw new Error(`datasource ${uid}: ${health.message}`);
  }
  const query = await json(`${GRAFANA}/api/ds/query`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "now-1h", to: "now",
      queries: [{ refId: "A", datasource: { uid: "prometheus" }, expr: "sum by (outcome) (rate(maxball_actions_total[5m]))", instant: true }],
    }),
  });
  const frames = query.results.A.frames ?? [];
  return frames.length ? `"${dash.dashboard.title}" with ${dash.dashboard.panels.length} panels; datasources healthy; panel query returned ${frames.length} series` : "";
});

if (report) {
  writeFileSync("oncall-report.md", `### On-call report (${report.responder}) for ${report.alertname}\n\n${report.text}\n`);
  console.log(`\n--- on-call report ---\n${report.text}\n`);
}
if (failures) {
  console.log(`${failures} observability check(s) failed`);
  process.exit(1);
}
console.log("observability pipeline verified");
