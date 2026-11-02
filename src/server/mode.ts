/**
 * Demo/local mode: same condition the historical PGlite path used, or the
 * explicit MAXBALL_DEMO=1 used by the self-contained container deployments
 * (#31-#35): local accounts, files on the volume, test-only email links and
 * published demo logins instead of Supabase Auth/Storage.
 */
export const localMode = () =>
  process.env.MAXBALL_DEMO === "1" ||
  (!process.env.DATABASE_URL &&
  process.env.NODE_ENV !== "production" &&
  !process.env.VERCEL);
