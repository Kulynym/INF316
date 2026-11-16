// End-to-end test of the on-call responder against one fake server that
// plays Anthropic, Prometheus, Loki, Jaeger, Alertmanager, the app and GitHub.
// No real API is called.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { createServer, type IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";
import Anthropic from "@anthropic-ai/sdk";
import { createResponder, configFromEnv, expressionOf, type Alert } from "./agent.ts";

type Issue = { number: number; title: string; state: string; labels: string[]; body: string; comments: string[]; html_url: string };
const issues: Issue[] = [];
const modelRequests: Record<string, unknown>[] = [];
const prometheusQueries: string[] = [];

const read = async (request: IncomingMessage) => {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(chunk as Buffer);
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? JSON.parse(text) : {};
};

const message = (content: unknown[], stop_reason: string) => ({
  id: `msg_${modelRequests.length}`, type: "message", role: "assistant", model: "claude-opus-5-5",
  content, stop_reason, stop_sequence: null, stop_details: null,
  usage: { input_tokens: 100, output_tokens: 50 },
});

const fake = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", "http://fake");
  const json = (status: number, body: unknown) => {
    response.writeHead(status, { "Content-Type": "application/json" });
    response.end(JSON.stringify(body));
  };
  if (url.pathname === "/v1/messages") {
    if (request.headers.authorization === "Bearer bad-key" || request.headers["x-api-key"] === "bad-key")
      return json(401, { type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } });
    const body = await read(request);
    modelRequests.push(body);
    const sawToolResult = JSON.stringify(body.messages).includes("tool_result");
    if (!sawToolResult)
      return json(200, message([
        { type: "tool_use", id: "toolu_1", name: "query_metrics", input: { promql: 'sum(increase(maxball_logins_total{result="failure"}[5m]))' } },
      ], "tool_use"));
    return json(200, message([{ type: "text", text: "## Summary\nLogin failures spiked to 42 in 5 minutes.\n## Severity\nwarning" }], "end_turn"));
  }
  if (url.pathname === "/api/v1/query") {
    prometheusQueries.push(url.searchParams.get("query") ?? "");
    return json(200, { status: "success", data: { resultType: "vector", result: [{ metric: {}, value: [Date.now() / 1000, "42"] }] } });
  }
  if (url.pathname === "/loki/api/v1/query_range")
    return json(200, { data: { result: [{ stream: { severity_text: "WARN", action: "login" }, values: [[String(Date.now() * 1e6), "action login unauthorized (401) in 12 ms"]] }] } });
  if (url.pathname === "/api/traces") return json(200, { data: [] });
  if (url.pathname === "/api/v2/alerts") return json(200, []);
  if (url.pathname === "/api/health") return json(200, { status: "ok", adapter: "postgres" });
  const repo = "/repos/Kulynym/INF316";
  if (url.pathname === `${repo}/issues` && request.method === "GET")
    return json(200, issues.filter((i) => i.state === "open" && i.labels.includes("incident")));
  if (url.pathname === `${repo}/issues` && request.method === "POST") {
    const body = await read(request);
    const issue = { number: issues.length + 1, state: "open", comments: [], html_url: `https://github.example/${issues.length + 1}`, ...body };
    issues.push(issue);
    return json(201, issue);
  }
  const comment = url.pathname.match(/\/issues\/(\d+)\/comments$/);
  if (comment && request.method === "POST") {
    issues[Number(comment[1]) - 1].comments.push((await read(request)).body);
    return json(201, {});
  }
  const patch = url.pathname.match(/\/issues\/(\d+)$/);
  if (patch && request.method === "PATCH") {
    Object.assign(issues[Number(patch[1]) - 1], await read(request));
    return json(200, {});
  }
  json(404, { error: `unexpected ${request.method} ${url.pathname}` });
});
fake.listen(0);
after(() => fake.close());
const base = () => `http://127.0.0.1:${(fake.address() as AddressInfo).port}`;

const configFor = () => ({
  ...configFromEnv({}),
  prometheusUrl: base(), lokiUrl: base(), jaegerUrl: base(), alertmanagerUrl: base(), appUrl: base(),
  githubApiUrl: base(), githubToken: "test-token", githubRepository: "Kulynym/INF316",
});

const alert = (status: Alert["status"], alertname = "MaxballLoginFailureSpike"): Alert => ({
  status,
  labels: { alertname, severity: "warning", environment: "production" },
  annotations: { summary: "Many failed logins", description: "Possible password guessing" },
  startsAt: new Date().toISOString(),
  endsAt: status === "resolved" ? new Date().toISOString() : undefined,
  generatorURL: `http://prometheus/graph?g0.expr=${encodeURIComponent('sum(increase(maxball_logins_total{result="failure"}[5m])) > 20')}`,
  fingerprint: "abc",
});

test("Prometheus generatorURL yields the alert expression", () => {
  assert.equal(expressionOf(alert("firing")), 'sum(increase(maxball_logins_total{result="failure"}[5m])) > 20');
});

test("a firing alert is investigated with tools, filed as an incident and closed when resolved", async () => {
  const client = new Anthropic({ apiKey: "test-key", baseURL: base(), maxRetries: 0 });
  const responder = createResponder(configFor(), { client });
  await responder.receive([alert("firing")]);

  // Claude was asked with the investigation tools and the server-side fallback.
  const first = modelRequests[0] as { model: string; tools: { name: string }[]; fallbacks: string; system: string };
  assert.equal(first.model, "claude-opus-5-5");
  assert.equal(first.fallbacks, "default");
  assert.deepEqual(first.tools.map((t) => t.name).sort(), ["check_health", "find_traces", "list_active_alerts", "query_metrics", "search_logs"]);
  assert.match(first.system, /untrusted text/);
  // The tool call ran against Prometheus and its result went back to the model.
  assert.ok(prometheusQueries.includes('sum(increase(maxball_logins_total{result="failure"}[5m]))'));
  assert.match(JSON.stringify(modelRequests[1]), /42/);

  assert.equal(issues.length, 1);
  assert.equal(issues[0].title, "[incident] MaxballLoginFailureSpike (production)");
  assert.deepEqual(issues[0].labels, ["incident", "severity:warning"]);
  assert.match(issues[0].body, /Login failures spiked to 42/);
  assert.equal(responder.reports[0].responder, "claude");

  // The same alert within the cooldown is not investigated again.
  await responder.receive([alert("firing")]);
  assert.equal(modelRequests.length, 2);

  await responder.receive([alert("resolved")]);
  assert.equal(issues[0].state, "closed");
  assert.match(issues[0].comments.at(-1) ?? "", /Resolved/);
});

test("without valid Anthropic credentials the responder still files the raw evidence", async () => {
  const client = new Anthropic({ apiKey: "bad-key", baseURL: base(), maxRetries: 0 });
  const responder = createResponder(configFor(), { client });
  await responder.receive([alert("firing", "MaxballActionErrors")]);
  const report = responder.reports[0];
  assert.equal(report.responder, "fallback");
  assert.match(report.text, /AI responder unavailable \(no valid Anthropic credentials\)/);
  assert.match(report.text, /Alert expression now/);
  assert.equal(issues.at(-1)?.title, "[incident] MaxballActionErrors (production)");
});
