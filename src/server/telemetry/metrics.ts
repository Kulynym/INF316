// Application-specific telemetry. Every helper goes through the
// OpenTelemetry API, which is a no-op until sdk.ts registers providers, so
// callers never check whether telemetry is on.
//
// Prometheus names after the collector (dots become underscores, counters
// get _total, the unit is appended):
//   maxball_actions_total{action,outcome}       every POST /api/actions call
//   maxball_action_duration_seconds{action,outcome}
//   maxball_feedback_created_total{type,author,anonymous}
//   maxball_comments_created_total
//   maxball_supports_toggled_total
//   maxball_reports_created_total{target,reason}
//   maxball_moderation_actions_total{action}
//   maxball_status_changes_total{status}
//   maxball_logins_total{result}
//   maxball_registrations_total
//   maxball_teacher_ratings_total
//   maxball_rate_limited_total{bucket}
//   maxball_feedback_open{type,status}          unresolved posts right now
import { logs, metrics, SeverityNumber, SpanStatusCode, trace, type Attributes } from "@opentelemetry/api";
import { store } from "../storage";

export { appEnvironment } from "./environment";

const tracer = trace.getTracer("maxball");
const logger = logs.getLogger("maxball");

// The metrics API has no proxy provider: instruments created before sdk.ts
// registers the global MeterProvider stay no-ops. They are therefore created
// on first use, which is always after Next.js ran instrumentation.ts.
let instruments: ReturnType<typeof createInstruments> | undefined;
const m = () => (instruments ??= createInstruments());
/** Registers the instruments (and the open-feedback gauge) if not done yet. */
export const startAppMetrics = () => void m();

function createInstruments() {
  const meter = metrics.getMeter("maxball");
  const counter = (name: string, description: string) => meter.createCounter(name, { description });
  // Unresolved posts by type and status, read from the store when the
  // collector asks (every export interval).
  meter
    .createObservableGauge("maxball.feedback.open", {
      description: "Published feedback that is not resolved yet",
    })
    .addCallback(async (result) => {
      const rows = await (await store()).find("feedback", {});
      const open = new Map<string, { type: string; status: string; count: number }>();
      for (const row of rows) {
        // Opinions have no workflow status; only suggestions and issues can be open.
        if (row.type === "opinion" || row.deleted || row.hidden) continue;
        if (row.status === "resolved" || row.status === "reviewed") continue;
        const type = String(row.type), status = String(row.status);
        const entry = open.get(`${type}/${status}`) ?? { type, status, count: 0 };
        entry.count++;
        open.set(`${type}/${status}`, entry);
      }
      for (const { type, status, count } of open.values()) result.observe(count, { type, status });
    });
  return {
    actions: counter("maxball.actions", "API actions handled, by action name and outcome"),
    actionDuration: meter.createHistogram("maxball.action.duration", {
      description: "Time to handle one API action",
      unit: "s",
      advice: { explicitBucketBoundaries: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10] },
    }),
    feedbackCreated: counter("maxball.feedback.created", "Feedback posts published"),
    commentsCreated: counter("maxball.comments.created", "Discussion comments written"),
    supportsToggled: counter("maxball.supports.toggled", "Support votes added or removed"),
    reportsCreated: counter("maxball.reports.created", "Content reports filed"),
    moderationActions: counter("maxball.moderation.actions", "Moderation decisions"),
    statusChanges: counter("maxball.status.changes", "Feedback status changes by managers"),
    logins: counter("maxball.logins", "Login attempts by result"),
    registrations: counter("maxball.registrations", "Accounts registered"),
    teacherRatings: counter("maxball.teacher.ratings", "Teacher ratings saved"),
    rateLimited: counter("maxball.rate_limited", "Requests refused by a rate limit"),
  };
}

// Action names come from the request body; only known ones become metric
// labels so a client cannot create unbounded time series.
const knownActions = new Set([
  "addCourse", "addTeacher", "comment", "completeUpload", "confirmEmail", "createPost",
  "createStaff", "deleteComment", "deletePost", "demoLogin", "discardUpload", "editComment",
  "editPost", "exchangeSession", "forgotPassword", "login", "logout", "moderate",
  "moderateComment", "officialReply", "prepareUpload", "rateTeacher", "readNotifications",
  "recoverPost", "register", "report", "resendConfirmation", "resetGuestCode", "resetPassword",
  "resolution", "runJobs", "setAccountActive", "setReportStatus", "setRole", "setStatus",
  "toggleBookmark", "toggleSupport", "unlockPost", "updateCatalog", "updateProfile",
]);
const actionLabel = (name: string) => (knownActions.has(name) ? name : "unknown");

export type Outcome = "ok" | "rejected" | "unauthorized" | "rate_limited" | "error";

export function outcomeOf(status: number): Outcome {
  if (status < 400) return "ok";
  if (status === 429) return "rate_limited";
  if (status === 401 || status === 403) return "unauthorized";
  return status >= 500 ? "error" : "rejected";
}

/**
 * Runs one API action inside a span, then records its count, duration and a
 * structured log line. `run` returns the HTTP status it produced.
 */
export async function observeAction(
  actionName: () => string,
  run: () => Promise<{ status: number; error?: unknown }>,
) {
  return tracer.startActiveSpan("action", async (span) => {
    const started = performance.now();
    const { status, error } = await run();
    // The name is known only after the body is parsed inside the span.
    const name = actionLabel(actionName());
    span.updateName(`action ${name}`);
    const seconds = (performance.now() - started) / 1000;
    const outcome = outcomeOf(status);
    const attributes: Attributes = { action: name, outcome };
    m().actions.add(1, attributes);
    m().actionDuration.record(seconds, attributes);
    span.setAttributes({ "maxball.action": name, "maxball.outcome": outcome, "http.response.status_code": status });
    if (outcome === "error") {
      span.setStatus({ code: SpanStatusCode.ERROR });
      if (error instanceof Error) span.recordException(error);
    }
    logger.emit({
      severityNumber: outcome === "error" ? SeverityNumber.ERROR : outcome === "ok" ? SeverityNumber.INFO : SeverityNumber.WARN,
      severityText: outcome === "error" ? "ERROR" : outcome === "ok" ? "INFO" : "WARN",
      body: `action ${name} ${outcome} (${status}) in ${Math.round(seconds * 1000)} ms`,
      attributes: {
        ...attributes,
        status,
        duration_ms: Math.round(seconds * 1000),
        ...(outcome === "error" && error instanceof Error ? { "exception.type": error.name } : {}),
      },
    });
    span.end();
    return status;
  });
}

const bool = (value: unknown) => (value === true || value === "true" ? "true" : "false");
const field = (input: Record<string, unknown>, key: string, fallback = "unknown") =>
  typeof input[key] === "string" && input[key] ? String(input[key]) : fallback;

/** Domain counters for an action, derived from its name, input and result. */
export function recordBusinessEvent(
  name: string,
  input: Record<string, unknown>,
  outcome: Outcome,
  signedIn: boolean,
) {
  if (name === "login")
    return m().logins.add(1, { result: outcome === "ok" ? "success" : outcome === "rate_limited" ? "rate_limited" : "failure" });
  if (outcome !== "ok") return;
  switch (name) {
    case "createPost":
      return m().feedbackCreated.add(1, {
        type: field(input, "type"),
        author: signedIn ? "account" : "guest",
        anonymous: bool(input.anonymous),
      });
    case "comment":
      return m().commentsCreated.add(1);
    case "toggleSupport":
      return m().supportsToggled.add(1);
    case "report":
      return m().reportsCreated.add(1, { target: field(input, "targetType"), reason: field(input, "reason") });
    case "moderate":
    case "moderateComment":
      return m().moderationActions.add(1, { action: `${name === "moderate" ? "post" : "comment"}_${field(input, "mode")}` });
    case "setStatus":
      return m().statusChanges.add(1, { status: field(input, "status") });
    case "register":
      return m().registrations.add(1);
    case "rateTeacher":
      return m().teacherRatings.add(1);
  }
}

/** Called by the rate limiter when it refuses a request; the bucket is the key prefix. */
export function recordRateLimited(key: string) {
  m().rateLimited.add(1, { bucket: key.split(":")[0] || "unknown" });
}
