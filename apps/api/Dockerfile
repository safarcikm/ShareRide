# The API container, which also serves the web app on the same origin
# (ADR 0018). Build from the repository root:
#   docker build -f apps/api/Dockerfile -t shareride-api .
# Node.js runs the TypeScript source directly (type stripping), so the API
# has no compile step; the image holds only its production dependencies and
# the exported web app.

FROM node:26-slim AS base
RUN npm install --global pnpm@12.18.0 && npm cache clean --force
WORKDIR /repo

# The web app, exported once. It calls the API on its own origin. Render
# passes the service's settings in as build arguments: with a Sentry DSN the
# app reports errors, and with the sentry-auth-token secret file its source
# maps go to Sentry. The maps are deleted either way, so they are never served
# (runbook, "Error reports and uptime").
FROM base AS web
ENV CI=1 EXPO_NO_TELEMETRY=1
ARG APP_ENV
ARG RENDER_GIT_COMMIT
ARG EXPO_PUBLIC_SENTRY_DSN
ENV EXPO_PUBLIC_APP_ENV=$APP_ENV \
  EXPO_PUBLIC_RELEASE=$RENDER_GIT_COMMIT \
  EXPO_PUBLIC_SENTRY_DSN=$EXPO_PUBLIC_SENTRY_DSN
COPY . .
RUN pnpm install --frozen-lockfile --filter "@shareride/mobile..."
RUN pnpm --filter @shareride/mobile export:web --source-maps
RUN --mount=type=secret,id=sentry-auth-token \
  pnpm --filter @shareride/mobile upload-source-maps

FROM base AS install
COPY . .
# Only the API and the workspace packages it uses, without dev dependencies.
# (`pnpm fetch` would cache this layer better, but then the install takes the
# app's packages too.)
RUN pnpm install --frozen-lockfile --prod --filter "@shareride/api..." \
  && rm -rf apps/mobile

FROM node:26-slim AS runtime
ENV NODE_ENV=production WEB_APP_DIR=/repo/web
WORKDIR /repo
# Owned by root: the node user, which runs the API, can read but not change them.
COPY --from=install /repo /repo
COPY --from=web /repo/apps/mobile/dist /repo/web
USER node
EXPOSE 3000
CMD ["node", "apps/api/src/server.ts"]
