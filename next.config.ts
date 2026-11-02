import type { NextConfig } from "next";

const config: NextConfig = {
  devIndicators: false,
  // Self-contained server for the single Docker image (#31): pages are
  // prerendered static assets served by the same Node process as /api/*.
  output: "standalone",
  serverExternalPackages: ["pg", "nodemailer", "typeorm", "better-sqlite3"],
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
  },
};
export default config;
