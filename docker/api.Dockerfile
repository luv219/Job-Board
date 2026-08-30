FROM node:24-alpine@sha256:e67514e5d0f6c46656005e1b693b2ec9d52e80b641307de684d4a015ba7a4eaf AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json
RUN npm ci

FROM dependencies AS development
COPY . .
EXPOSE 3000
CMD ["npm", "run", "dev", "-w", "@job-board/api"]

FROM dependencies AS build
COPY . .
RUN npm run build -w @job-board/contracts && npm run build -w @job-board/api && npm prune --omit=dev

FROM node:24-alpine@sha256:e67514e5d0f6c46656005e1b693b2ec9d52e80b641307de684d4a015ba7a4eaf AS production
ARG APP_VERSION=0.1.0
ARG APP_REVISION=unknown
ARG IMAGE_SOURCE=https://github.com/luv219/Job-Board
WORKDIR /app
LABEL org.opencontainers.image.title="Job Board API" \
  org.opencontainers.image.version="${APP_VERSION}" \
  org.opencontainers.image.revision="${APP_REVISION}" \
  org.opencontainers.image.source="${IMAGE_SOURCE}"
ENV NODE_ENV=production \
  APP_VERSION=${APP_VERSION} \
  APP_REVISION=${APP_REVISION}
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/apps/api/dist ./apps/api/dist
COPY --from=build --chown=node:node /app/apps/api/package.json ./apps/api/package.json
COPY --from=build --chown=node:node /app/packages/contracts/dist ./packages/contracts/dist
COPY --from=build --chown=node:node /app/packages/contracts/package.json ./packages/contracts/package.json
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 CMD ["node", "-e", "fetch('http://127.0.0.1:3000/api/v1/health/ready').then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"]
CMD ["node", "apps/api/dist/server.js"]
