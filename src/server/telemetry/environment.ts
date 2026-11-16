// Which deployment this process is: "development" (Render, local) or
// "production" (AWS). Reported by /api/health and on every telemetry signal.
export const appEnvironment = () => process.env.APP_ENV || "development";
