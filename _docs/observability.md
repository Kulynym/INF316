# DevOps and Observability (Assignment 4)

Date: 2026-11-17. Repository: [Kulynym/INF316](https://github.com/Kulynym/INF316).

| Requirement | Where |
| --- | --- |
| Separate development and production environments | [Environments](#environments) — Render = development, AWS = production |
| Manual CI/CD trigger promoting development → production | [`.github/workflows/promote.yml`](../.github/workflows/promote.yml) |
| OpenTelemetry metrics, traces and logs | [`src/server/telemetry/`](../src/server/telemetry), [`otel-collector.yaml`](../deploy/observability/otel-collector.yaml) |
| Application-specific metrics + dashboard | [Metrics](#application-metrics), [`maxball.json`](../deploy/observability/grafana/dashboards/maxball.json) |
| Alerts when the metrics change | [`alerts.yml`](../deploy/observability/alerts.yml) + unit tests [`alerts.test.yml`](../deploy/observability/alerts.test.yml) |
| AI agent as the on-call responder | [`oncall/agent.ts`](../oncall/agent.ts) |

## Architecture

```text
             development (Render)                         production (AWS EC2, CloudFormation)
 green commit on main ──► deploy hook          manual "Promote to production" ──► git tag `production`
                          app (APP_ENV=development)         instance timer follows the tag ──► app (APP_ENV=production)
                                │ optional OTLP + token                              │ OTLP/HTTP
                                └───────────────► Caddy /otlp ─► OpenTelemetry Collector ◄┘
                                                                   │ traces ─► Jaeger
                                                                   │ logs   ─► Loki
                                                                   │ metrics ◄─ Prometheus ─► alert rules ─► Alertmanager
                                                                   │                                         │ webhook
                                                Grafana (/grafana) ◄┘ dashboards, logs, traces     AI on-call agent ─► GitHub issue `incident`
```

The same stack runs locally and in CI from
[`docker-compose.observability.yml`](../docker-compose.observability.yml):

```sh
docker compose -f docker-compose.yml -f docker-compose.observability.yml up --build -d --wait
# app :3000  Grafana :3001  Prometheus :9090  Alertmanager :9093  Jaeger :16686  agent :8080/reports
```

## Environments

| | Development | Production |
| --- | --- | --- |
| Where | Render free web service + Render Postgres ([`render.yaml`](../render.yaml)) | AWS EC2 `t3.small` from [`maxball-stack.yaml`](../deploy/aws/maxball-stack.yaml) |
| `APP_ENV` | `development` | `production` |
| Gets a commit | automatically, every green commit on `main` (CI job `deploy-development`) | only by the manual promotion workflow |
| GitHub environment | `development` | `production` (add required reviewers to gate promotions) |
| Data | its own database | its own database (PostgreSQL in the stack) |
| Telemetry | off, or sent to the production collector with a token | full stack beside the app |

`/api/health` reports `environment` and the deployed `version` (commit SHA), so
both environments can be checked from outside.

## Promotion (manual CI/CD trigger)

GitHub → Actions → **Promote to production** → *Run workflow*.

1. Resolves the commit: by default the one development is running now
   (read from `RENDER_APP_URL/api/health`); any other green commit on `main` can
   be given, e.g. to roll back (turn off `require_development`).
2. Re-tags the images CI tested — `ghcr.io/kulynym/inf316:<sha>` and
   `…/inf316-oncall:<sha>` — as `:production`. Nothing is rebuilt; an image
   exists only if every CI job passed for that commit.
3. Moves the git tag `production` to the commit.
4. The EC2 instance's `maxball-autodeploy.timer` notices the tag within a
   minute and runs [`deploy.sh`](../deploy/aws/deploy.sh) for it (no AWS
   credentials in GitHub: the AWS free plan denies IAM OIDC providers).
5. The workflow waits until `AWS_APP_URL/api/health` reports the commit.

## OpenTelemetry

[`src/instrumentation.ts`](../src/instrumentation.ts) starts the Node SDK
([`sdk.ts`](../src/server/telemetry/sdk.ts)) when `OTEL_EXPORTER_OTLP_ENDPOINT` is
set. It exports over OTLP/HTTP:

- **Traces** — HTTP server/client and PostgreSQL auto-instrumentation, Next.js
  route spans, and one `action <name>` span per API call with
  `maxball.action` / `maxball.outcome`.
- **Metrics** — the application metrics below, plus `http.server.request.duration`
  and `db.client.*` from the instrumentations.
- **Logs** — one structured record per API action (`action`, `outcome`, `status`,
  `duration_ms`), with the trace id, so Grafana links a log line to its trace.

Every signal carries `service.name=maxball`, `service.version=<sha>` and
`deployment.environment.name`; the collector copies the environment onto every
metric as the `environment` label.

## Application metrics

Defined in [`metrics.ts`](../src/server/telemetry/metrics.ts); Prometheus names:

| Metric | Labels | Meaning |
| --- | --- | --- |
| `maxball_actions_total` | `action`, `outcome` | Every API action; outcome `ok`, `rejected`, `unauthorized`, `rate_limited`, `error` |
| `maxball_action_duration_seconds` | `action`, `outcome` | Histogram of action time |
| `maxball_feedback_created_total` | `type`, `author`, `anonymous` | Posts published (opinion / suggestion / issue; guest or account) |
| `maxball_feedback_open` | `type`, `status` | Suggestions and issues not resolved yet (gauge, read from the database) |
| `maxball_comments_created_total` | | Discussion comments |
| `maxball_supports_toggled_total` | | Support votes |
| `maxball_reports_created_total` | `target`, `reason` | Content reports |
| `maxball_moderation_actions_total` | `action` | Hide / restore / delete decisions |
| `maxball_status_changes_total` | `status` | Manager status changes |
| `maxball_logins_total` | `result` | `success`, `failure`, `rate_limited` |
| `maxball_registrations_total` | | New accounts |
| `maxball_teacher_ratings_total` | | Teacher ratings saved |
| `maxball_rate_limited_total` | `bucket` | Requests refused per limiter (`request`, `login`, `report`, …) |
| `httpcheck_status` | `http_status_class` | Collector probe of `/api/health` every 15 s |

Only known action names become labels, so clients cannot create unbounded series.

## Dashboard

Grafana provisions **MAXBALL application**
([generator](../deploy/observability/grafana/build-dashboard.py)) with an
environment selector:

- **Overview** — site health, actions/min, server error ratio, p95 action time, open issues, posts today.
- **Community activity** — posts by type, open feedback by type/status, engagement, moderation.
- **Reliability** — actions by outcome, latency by action, logins by result, rate limiting.
- **Alerts and logs** — firing alerts and warning/error logs (each log links to its trace in Jaeger).

Production: `https://<ip>.sslip.io/grafana/` (read-only without login; the admin
password is `GRAFANA_ADMIN_PASSWORD` in `/opt/maxball/.env`).

## Alerts

[`alerts.yml`](../deploy/observability/alerts.yml) — every rule fires when a metric changes
away from normal, and [`alerts.test.yml`](../deploy/observability/alerts.test.yml) proves it with
`promtool test rules` (quiet before the change, firing after).

| Alert | Fires when | Severity |
| --- | --- | --- |
| <a id="maxballdown"></a>MaxballDown | `/api/health` has no 2xx for over a minute | critical |
| <a id="maxballactionerrors"></a>MaxballActionErrors | > 5 % of actions end in 5xx for 2 minutes | critical |
| <a id="maxballslowactions"></a>MaxballSlowActions | p95 action time > 1 s for 5 minutes | warning |
| <a id="maxballloginfailurespike"></a>MaxballLoginFailureSpike | > 20 failed logins in 5 minutes | warning |
| <a id="maxballfeedbackvolumechange"></a>MaxballFeedbackVolumeChange | posts in 15 min > 10 and > 3× the previous hour's pace | warning |
| <a id="maxballreportsspike"></a>MaxballReportsSpike | ≥ 5 content reports in 15 minutes | warning |
| <a id="maxballopenissuesgrowing"></a>MaxballOpenIssuesGrowing | ≥ 5 more open issues than an hour ago | info |
| <a id="maxballratelimiting"></a>MaxballRateLimiting | > 30 rate-limited requests in 5 minutes per limiter | warning |

Alertmanager groups by alert and environment and sends firing and resolved
notifications to the on-call agent.

## AI on-call responder

[`oncall/agent.ts`](../oncall/agent.ts) receives Alertmanager's webhook and, for
each new firing alert, lets Claude (`claude-opus-5-5`, adaptive thinking,
server-side refusal fallback enabled) investigate with **read-only** tools:

| Tool | What it reads |
| --- | --- |
| `query_metrics` | PromQL instant or range queries |
| `search_logs` | LogQL over the application logs |
| `find_traces` | recent / error traces of `maxball` in Jaeger |
| `check_health` | `/api/health` now |
| `list_active_alerts` | everything firing in Alertmanager |

It writes a report (Summary, Evidence, Likely cause, Recommended actions,
Severity) and files it as a GitHub issue labelled `incident` +
`severity:<level>`; when the alert resolves it comments and closes the issue.
Repeats within 30 minutes are not re-investigated. Alert text, logs and tool
results are treated as untrusted data in the prompt, and the agent has no tool
that changes the system — people act on its recommendations.

Without `ANTHROPIC_API_KEY` the agent still files a report with the raw
evidence (the alert expression's current value, actions by outcome, recent
warning/error logs, health) and says the AI responder was unavailable.

Configuration (environment): `ANTHROPIC_API_KEY`, `GITHUB_TOKEN` +
`GITHUB_REPOSITORY` (fine-grained token, Issues read/write on this repository),
`ONCALL_MODEL`, `ONCALL_COOLDOWN_MINUTES`, telemetry URLs.

## Verification

| Check | Where |
| --- | --- |
| Agent loop with fake Anthropic/GitHub APIs (tool call → report → issue → close; fallback without credentials) | `oncall/agent.test.ts`, CI `unit` |
| Alert rules fire on metric changes and stay quiet otherwise | `promtool test rules`, CI `unit` |
| Collector and Alertmanager configs valid; dashboard JSON matches its generator | CI `unit` |
| Full pipeline: traffic → metrics/logs/traces → dashboard query → alert → Alertmanager → agent report | [`verify-observability.mjs`](../scripts/verify-observability.mjs), CI `observability` |

Locally on 2026-11-17 (before the repository could be pushed): the production
build with OpenTelemetry passed the full e2e suite (65/65) and HTTP suites; an
OTLP capture of the same traffic showed all application metrics, action spans
with PostgreSQL child spans, and 44/44 log records carrying trace ids;
`promtool test rules` passed for all 8 alerts; a synthetic alert sent through a
real Alertmanager reached the agent, which filed its fallback report (no API
key was available).

## Owner setup

1. Repository secrets/variables: `RENDER_DEPLOY_HOOK_URL` (secret),
   `RENDER_APP_URL`, `AWS_APP_URL` (variables). Optional secret
   `ANTHROPIC_API_KEY` lets the CI `observability` job use Claude too.
2. Settings → Environments → `production` → Required reviewers (optional gate).
3. AWS: recreate the stack from `deploy/aws/maxball-stack.yaml` (parameters
   `AnthropicApiKey`, `OncallGithubToken`, optional `OtlpIngestToken`).
4. Render (optional, development telemetry): set `OTEL_EXPORTER_OTLP_ENDPOINT=https://<aws>/otlp`
   and `OTEL_EXPORTER_OTLP_HEADERS=Authorization=Bearer%20<OtlpIngestToken>`.
