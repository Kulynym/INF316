// Liveness + database round trip for container health checks, CI smoke tests
// and cloud load balancers (#30/#31). Public, cache-free and data-free.
import { NextResponse } from "next/server";
import { requestedAdapter, store } from "@/server/storage";
import { appEnvironment, startAppMetrics } from "@/server/telemetry/metrics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  const headers = { "Cache-Control": "no-store" };
  startAppMetrics();
  try {
    await (await store()).get("courses", "health-check");
    return NextResponse.json(
      {
        status: "ok",
        adapter: requestedAdapter(),
        environment: appEnvironment(),
        version: process.env.APP_VERSION || "dev",
      },
      { headers },
    );
  } catch {
    return NextResponse.json(
      { status: "error", adapter: requestedAdapter() },
      { status: 503, headers },
    );
  }
}
