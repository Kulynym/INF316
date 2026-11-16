# AI on-call responder (oncall/agent.ts). Node 24 runs the TypeScript source
# directly (type stripping), so there is no build step.
FROM node:24-bookworm-slim
WORKDIR /agent
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY agent.ts ./
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD node -e "fetch('http://127.0.0.1:8080/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "agent.ts"]
