# Web app (Next.js). Multi-stage: the final image keeps only the built server, not the build tools.

# ---- Stage 1: install dependencies (cached until package*.json changes) ----
FROM node:24-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---- Stage 2: build ----
FROM node:24-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# The DB client is created when modules load, so the build needs a value. Pages render per request,
# so nothing connects during the build; the real URL is given at run time and never baked in.
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build
RUN npm run build

# ---- Stage 3: run (this is the image that ships) ----
FROM node:24-slim AS run
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
# Don't run as root inside the container.
USER node
EXPOSE 3000
CMD ["node", "server.js"]
