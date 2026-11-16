import { context, requireManager } from "@/server/context";
import { requireSameOrigin, AppError, rateLimit } from "@/server/security";
import { action } from "@/server/actions";
import { authAction } from "@/server/auth";
import { fileAction } from "@/server/files";
import { runJobs } from "@/server/jobs";
import { failure, readJson, respond } from "@/server/http";
import { observeAction, outcomeOf, recordBusinessEvent } from "@/server/telemetry/metrics";

export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(request: Request) {
  let response: Response = failure(new AppError("Әрекет атауы қажет."));
  let name = "unknown";
  let input: Record<string, unknown> = {};
  let signedIn = false;
  // Every call is traced, counted, timed and logged (src/server/telemetry).
  await observeAction(
    () => name,
    async () => {
      try {
        requireSameOrigin(request);
        if (Number(request.headers.get("content-length") || 0) > 100000)
          throw new AppError("Сұраныс тым үлкен.", 413);
        input = await readJson(request);
        if (typeof input.action !== "string") throw new AppError("Әрекет атауы қажет.");
        name = input.action;
        const ctx = await context(request);
        signedIn = Boolean(ctx.viewer);
        await rateLimit(ctx.store, `request:${ctx.ip}`, 180, 60);
        if (name === "runJobs") {
          requireManager(ctx);
          response = respond(ctx, { ok: true, results: await runJobs() });
        } else {
          const result =
            (await authAction(ctx, name, input)) ||
            (await fileAction(ctx, name, input)) ||
            (await action(ctx, name, input));
          response = respond(ctx, result);
        }
        return { status: response.status };
      } catch (error) {
        response = failure(error);
        return { status: response.status, error };
      }
    },
  );
  recordBusinessEvent(name, input, outcomeOf(response.status), signedIn);
  return response;
}
