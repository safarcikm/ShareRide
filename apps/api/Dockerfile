# The API container, which also serves the web app on the same origin
# (ADR 0018). Build from the repository root:
#   docker build -f apps/api/Dockerfile -t shareride-api .
# Node.js runs the TypeScript source directly (type stripping), so the API
# has no compile step; the image holds only its production dependencies and
# the exported web app.

FROM node:26-slim AS base
RUN npm install --global pnpm@12.18.0 && npm cache clean --force
WORKDIR /repo

# The web app, exported once. It calls the API on its own origin.
FROM base AS web
ENV CI=1 EXPO_NO_TELEMETRY=1
COPY . .
RUN pnpm install --frozen-lockfile --filter "@shareride/mobile..."
RUN pnpm --filter @shareride/mobile export:web

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
