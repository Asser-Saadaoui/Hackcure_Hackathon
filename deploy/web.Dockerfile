# Build context: repository root. Builds both web apps and serves them with Caddy (automatic HTTPS).
FROM node:22-alpine AS dashboard
WORKDIR /src
COPY dashboard/package.json dashboard/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY dashboard/ ./
RUN npm run build

FROM node:22-alpine AS patient
WORKDIR /src
COPY mobile/package.json mobile/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY mobile/ ./
RUN EXPO_PUBLIC_API_URL=same-origin npx expo export --platform web --output-dir dist

FROM caddy:2.10-alpine
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=dashboard /src/dist /srv/dashboard
COPY --from=patient /src/dist /srv/patient
