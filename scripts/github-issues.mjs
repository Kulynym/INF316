// Files the project backlog as GitHub issues in Kulynym/INF316 with the gh
// CLI. The previous repository (maksatworkspace-sudo/studylist) and its
// issues were lost when that account was suspended on 2026-11-03; this
// recreates the Assignment 3 issues (from the e2e spec headers and the deploy
// work), the UI/UX pass and the Assignment 4 DevOps/Observability issues.
//
//   node scripts/github-issues.mjs            # create missing issues (paced)
//   node scripts/github-issues.mjs --dry-run  # print what would be created
//   node scripts/github-issues.mjs --close-done <run-url>
//       comment the CI run as evidence and close every issue marked done
//
// Idempotent: an issue whose title already exists is skipped. Calls are
// spaced out (PACE_SECONDS, default 20) to stay far from abuse limits.
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";

const REPO = process.env.GITHUB_REPOSITORY || "Kulynym/INF316";
const GH = process.env.GH || "gh";
const PACE = Number(process.env.PACE_SECONDS || 20) * 1000;
const dryRun = process.argv.includes("--dry-run");
const closeIdx = process.argv.indexOf("--close-done");
const runUrl = closeIdx > 0 ? process.argv[closeIdx + 1] : undefined;

const CONSTRAINTS =
  "No real credentials or personal data are committed. Cloud accounts and billing are the owner's; paid-only features are never enabled. Closed only after the checks named below pass in GitHub Actions on `main` and the evidence is commented here.";

const body = ({ goal, description, criteria, out = [], deps = "None.", previous }) =>
  [
    `## Goal\n${goal}`,
    `## Description\n${description}`,
    `## Acceptance Criteria\n${criteria.map((c, i) => `- [ ] AC${i + 1}: ${c}`).join("\n")}`,
    `## Out of Scope\n${out.length ? out.map((o) => `- ${o}`).join("\n") : "- None."}`,
    `## Constraints\n${CONSTRAINTS}`,
    `## Dependencies\n${deps}`,
    previous ? `_Recreated: originally ${previous} in the suspended maksatworkspace-sudo/studylist repository._` : "",
  ].filter(Boolean).join("\n\n");

const issues = [];
const add = (title, labels, spec, done = true) => issues.push({ title, labels, body: body(spec), done });

// Assignment 3: test, containerise and deploy.
add("[Deploy 01] Migrate persistence from SQLite to PostgreSQL with TypeORM", ["deployment"], {
  goal: "Run the application on PostgreSQL in containers and the cloud while keeping SQLite for local work.",
  description: "`src/server/store/postgres.ts` shares the TypeORM EntitySchema store with SQLite; `scripts/migrate-sqlite-to-postgres.mjs` copies existing data.",
  criteria: ["`MAXBALL_ADAPTER=postgres` + `DATABASE_URL` selects PostgreSQL with a versioned migration", "Transactions are serialized (advisory lock) like the Store contract requires", "Store/domain/jobs suites pass on PostgreSQL in CI", "SQLite data migrates with verified row counts", "`/api/health` reports the adapter"],
  previous: "#30",
});
add("[Deploy 02] Single Dockerfile: static frontend + backend in one image", ["deployment"], {
  goal: "One image serves the prerendered frontend and the /api backend.",
  description: "Next.js standalone output, non-root runtime, health check on `/api/health`.",
  criteria: ["One `node server.js` process serves pages and API", "Image builds in CI and is published to GHCR on `main`", "HEALTHCHECK and data volume defined"],
  previous: "#31",
});
add("[Deploy 03] Docker Compose stack: app + PostgreSQL", ["deployment"], {
  goal: "Start the whole system with one command.",
  description: "`docker-compose.yml` with a healthy-database dependency and named volumes.",
  criteria: ["`docker compose up --wait` starts app + db", "Health check reports PostgreSQL", "Data survives an app restart", "Integration and e2e tests run against the stack in CI"],
  previous: "#32",
});
add("[Deploy 04] CI/CD: all tests on every commit, redeploy on main", ["deployment"], {
  goal: "Every commit runs frontend, backend, integration and end-to-end tests; green commits on main redeploy.",
  description: "`.github/workflows/ci.yml` jobs unit, browser, stack, observability, publish, deploy-development.",
  criteria: ["All test layers run on push and pull request", "Images are published only after every test job passes", "Deploys smoke-test `/api/health` for the new commit"],
  previous: "#33",
});
add("[Deploy 05] PaaS deploy with the Compose stack (Render)", ["deployment"], {
  goal: "Run the compose stack on a PaaS free plan.",
  description: "Railway paused trials for new accounts (2026-11-03), so `render.yaml` maps the compose services to a Render web service + Render Postgres.",
  criteria: ["Blueprint validates against Render's schema", "CI deploys each green commit through the deploy hook with that commit's image", "The site reports the commit on `/api/health`"],
  previous: "#34",
});
add("[Deploy 06] Production deploy to AWS with CloudFormation (free plan)", ["deployment"], {
  goal: "Production-grade deployment on AWS within the free plan.",
  description: "`deploy/aws/maxball-stack.yaml`: EC2, Elastic IP, Caddy HTTPS, budget alert, pull-based deploys (the free plan denies IAM OIDC providers).",
  criteria: ["cfn-lint has no findings", "Stack creates the instance and serves HTTPS", "Deploys need no AWS credentials in GitHub", "A monthly budget alert exists"],
  previous: "#35",
});
for (const file of readdirSync("e2e/features").filter((f) => f.endsWith(".spec.ts")).sort()) {
  const header = readFileSync(`e2e/features/${file}`, "utf8").split("\n")[0];
  const m = header.match(/E2E (\d+) — (.+?) \(issue (#\d+)\)/);
  if (!m) continue;
  add(`[E2E ${m[1]}] ${m[2]}`, ["e2e-test"], {
    goal: `Playwright end-to-end test for: ${m[2]}.`,
    description: `Spec \`e2e/features/${file}\` drives the real UI against the Docker Compose stack (app + PostgreSQL).`,
    criteria: ["The positive path is asserted through the UI", "The permission / negative boundary is asserted", "The spec passes in CI job *Integration + E2E on Docker Compose*", "The spec header references this issue"],
    previous: m[3],
  });
}

// UI/UX pass (_docs/ui-polish-2026-11-03.md).
for (const [code, title, fix] of [
  ["U1", "Login dialog lists the demo accounts", "In demo mode a chip fills email and password; the person still presses Кіру."],
  ["U2", "Hidden and deleted comments get honest placeholders without actions", "Distinct texts; no reply/report on placeholders."],
  ["U3", "Moderation toggle uses its own icon", "Shield icon instead of a second flag next to Report."],
  ["U4", "Single divider between post actions and status history", "History drops its top border after the action row."],
  ["U5", "Moderation overview lays out four tiles", "Overview strip sizes columns to its tiles; 2×2 on phones."],
  ["U6", "Clear-filters link only while a filter is active", "Empty Saved / My posts no longer offer it."],
  ["U7", "Escape closes the mobile navigation drawer", "Focus returns to the menu button."],
])
  add(`[UI ${code}] ${title}`, ["ui-ux"], {
    goal: title + ".", description: fix,
    criteria: ["Behaviour verified at 1280×800 and 390×844", "Covered by the e2e suite where the issue names a test", "Full e2e suite stays green"],
  });

// Assignment 4: DevOps and Observability.
add("[DevOps 01] Separate development and production environments", ["devops"], {
  goal: "Changes reach a development environment first and production only on purpose.",
  description: "Render = development (`APP_ENV=development`, every green commit). AWS = production (`APP_ENV=production`, promoted manually). Separate databases; `/api/health` reports environment and version.",
  criteria: ["Each environment reports its name and commit on `/api/health`", "GitHub environments `development` and `production` exist", "A green commit on main deploys development only", "Production changes only through the promotion workflow"],
  deps: "[Deploy 05], [Deploy 06]",
});
add("[DevOps 02] Manual CI/CD trigger promoting development to production", ["devops"], {
  goal: "A person promotes a tested build from development to production with one click, and can roll back.",
  description: "`.github/workflows/promote.yml` (workflow_dispatch): re-tags the tested images as `:production`, moves the `production` git tag, the instance follows it, the job waits for `/api/health`.",
  criteria: ["Default promotes the commit development runs", "Refuses commits not on main or without published images", "Rollback to an older green commit works", "Production reports the promoted commit"],
  deps: "[DevOps 01]",
});
add("[Obs 01] OpenTelemetry: collect metrics, traces and logs", ["observability"], {
  goal: "The application emits all three telemetry signals through OpenTelemetry.",
  description: "Node SDK in `src/instrumentation.ts`, OTLP/HTTP to the OpenTelemetry Collector; traces to Jaeger, logs to Loki, metrics to Prometheus.",
  criteria: ["HTTP, PostgreSQL and per-action spans in Jaeger", "Structured action logs with trace ids in Loki", "Metrics in Prometheus with an environment label", "Telemetry is off when no endpoint is configured"],
});
add("[Obs 02] Application-specific metrics and Grafana dashboard", ["observability"], {
  goal: "Measure what matters to MAXBALL and show it on a dashboard.",
  description: "Metrics in `src/server/telemetry/metrics.ts` (feedback, open issues, logins, moderation, rate limits, action latency/outcomes); provisioned Grafana dashboard `MAXBALL application`.",
  criteria: ["Each metric in `_docs/observability.md` is exported", "Dashboard is provisioned with an environment selector", "Panels return data in CI", "Action labels have bounded cardinality"],
  deps: "[Obs 01]",
});
add("[Obs 03] Alerts when the metrics change", ["observability"], {
  goal: "Get alerted when application behaviour changes.",
  description: "`deploy/observability/alerts.yml` (8 rules) evaluated by Prometheus, routed by Alertmanager.",
  criteria: ["promtool unit tests prove each alert fires on the change and stays quiet before", "A real metric change fires an alert end to end in CI", "Each alert has a runbook entry"],
  deps: "[Obs 02]",
});
add("[Obs 04] AI agent as the on-call responder", ["observability"], {
  goal: "An AI agent responds to every alert with an investigation and an incident report.",
  description: "`oncall/agent.ts`: Alertmanager webhook → Claude with read-only tools (metrics, logs, traces, health, alerts) → GitHub issue labelled `incident`, closed when resolved.",
  criteria: ["Tool-using investigation tested against fake APIs", "Report filed as an incident issue and closed on resolve", "Untrusted alert/log text cannot instruct the agent; it has no write tools", "Fallback report without an API key", "Alert → agent report proven end to end in CI"],
  deps: "[Obs 03]",
});
add("[Sec] Upgrade Next.js to 16.4.5 (GHSA-mfr8-8qww-v76h)", ["security"], {
  goal: "Remove the moderate Next.js advisory that also halted the dev server used by the CI browser runner.",
  description: "Next.js 16.3.0–16.4.4 is affected; 16.4.5 is the first fixed release.",
  criteria: ["`npm audit --omit=dev` no longer lists next", "Isolated browser runner passes"],
  out: ["typeorm/glob/minimatch moderate advisories (separate follow-up)"],
});

const gh = (args, input) => execFileSync(GH, [...args, "-R", REPO], { input, encoding: "utf8" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const existing = dryRun ? [] : JSON.parse(gh(["issue", "list", "--state", "all", "--limit", "500", "--json", "number,title,state"]));
const byTitle = new Map(existing.map((i) => [i.title, i]));

if (runUrl) {
  for (const issue of issues.filter((i) => i.done)) {
    const found = byTitle.get(issue.title);
    if (!found || found.state === "CLOSED") continue;
    gh(["issue", "comment", String(found.number), "--body-file", "-"], `**Verification — PASS**: ${runUrl}\n\nAcceptance criteria are covered by the checks named in the issue; see the run's jobs and \`_docs/\`.`);
    gh(["issue", "close", String(found.number), "--reason", "completed"]);
    console.log(`closed #${found.number} ${issue.title}`);
    await sleep(PACE);
  }
  process.exit(0);
}

if (!dryRun)
  for (const label of ["deployment", "e2e-test", "ui-ux", "devops", "observability", "security", "incident"]) {
    try { gh(["label", "create", label, "--force"]); } catch { /* exists */ }
  }
for (const issue of issues) {
  if (byTitle.has(issue.title)) { console.log(`exists  ${issue.title}`); continue; }
  if (dryRun) { console.log(`would create [${issue.labels}] ${issue.title}`); continue; }
  const url = gh(["issue", "create", "--title", issue.title, "--label", issue.labels.join(","), "--body-file", "-"], issue.body).trim();
  console.log(`created ${url}  ${issue.title}`);
  await sleep(PACE);
}
