FROM node:current-alpine AS builder
WORKDIR /app/scenario-mock-tool
COPY scenario-mock-tool/package*.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund
COPY Atspm/WebUI/src /app/Atspm/WebUI/src
COPY scenario-mock-tool/ ./
RUN npm run build

FROM node:current-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production PORT=3081 HOSTNAME=0.0.0.0
COPY --from=builder --chown=node:node /app/scenario-mock-tool/.next/standalone ./
COPY --from=builder --chown=node:node /app/scenario-mock-tool/.next/static ./scenario-mock-tool/.next/static
USER node
EXPOSE 3081
CMD ["node", "scenario-mock-tool/server.js"]
