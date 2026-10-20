FROM node:22-alpine AS base
RUN apk add --no-cache libc6-compat
WORKDIR /app

FROM base AS deps
ENV NODE_ENV=development
COPY package.json package-lock.json ./
COPY apps/backend/package.json apps/backend/package.json
RUN npm ci --include=dev

FROM deps AS builder
COPY . .
RUN npm run build --workspace=@dtc/backend

FROM base AS runner
ENV NODE_ENV=production
WORKDIR /app
COPY --from=builder /app/apps/backend/.medusa/server ./
RUN npm install --omit=dev --no-audit --no-fund
EXPOSE 9000
COPY scripts/preflight.js ./
CMD ["sh", "-c", "node preflight.js; npm run start:prod"]
