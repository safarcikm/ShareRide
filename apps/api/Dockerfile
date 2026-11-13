# The API container. Build from the repository root:
#   docker build -f apps/api/Dockerfile -t shareride-api .
# Node.js runs the TypeScript source directly (type stripping), so there is
# no compile step; the image holds only production dependencies.

FROM node:26-slim AS base
RUN npm install --global pnpm@12.18.0 && npm cache clean --force
WORKDIR /repo

FROM base AS install
COPY . .
# Only the API and the workspace packages it uses, without dev dependencies.
# (`pnpm fetch` would cache this layer better, but then the install takes the
# app's packages too.)
RUN pnpm install --frozen-lockfile --prod --filter "@shareride/api..."

FROM node:26-slim AS runtime
ENV NODE_ENV=production
WORKDIR /repo
COPY --from=install --chown=node:node /repo /repo
USER node
EXPOSE 3000
CMD ["node", "apps/api/src/server.ts"]
