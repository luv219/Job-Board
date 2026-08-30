FROM node:24-alpine@sha256:e67514e5d0f6c46656005e1b693b2ec9d52e80b641307de684d4a015ba7a4eaf AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json
RUN npm ci

FROM dependencies AS development
COPY . .
EXPOSE 5173
CMD ["npm", "run", "dev", "-w", "@job-board/web", "--", "--host", "0.0.0.0"]

FROM dependencies AS build
ARG VITE_API_BASE_URL
COPY . .
RUN test -n "$VITE_API_BASE_URL" && npm run build -w @job-board/contracts && VITE_API_BASE_URL="$VITE_API_BASE_URL" npm run build -w @job-board/web

FROM nginx:1.29-alpine@sha256:5616878291a2eed594aee8db4dade5878cf7edcb475e59193904b198d9b830de AS production
ARG APP_VERSION=0.1.0
ARG APP_REVISION=unknown
ARG IMAGE_SOURCE=https://github.com/luv219/Job-Board
LABEL org.opencontainers.image.title="Job Board web" \
  org.opencontainers.image.version="${APP_VERSION}" \
  org.opencontainers.image.revision="${APP_REVISION}" \
  org.opencontainers.image.source="${IMAGE_SOURCE}"
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
COPY docker/nginx.conf /etc/nginx/nginx.conf
RUN mkdir -p /tmp/nginx/client_temp /tmp/nginx/proxy_temp /tmp/nginx/fastcgi_temp /tmp/nginx/uwsgi_temp /tmp/nginx/scgi_temp \
  && chown -R nginx:nginx /tmp/nginx
EXPOSE 8080
USER nginx
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 CMD ["wget", "-q", "-O", "/dev/null", "http://127.0.0.1:8080/"]
CMD ["nginx", "-g", "daemon off;"]
