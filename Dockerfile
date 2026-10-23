# === Production dependencies (no native modules) ===
FROM node:24-alpine AS deps

RUN apk upgrade --no-cache

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

# === Builder stage (needs devDeps + build tools for canvas/next build) ===
FROM node:24-alpine AS builder

RUN apk upgrade --no-cache

WORKDIR /app
RUN apk add --no-cache python3 make g++ cairo-dev pango-dev jpeg-dev giflib-dev librsvg-dev pixman-dev

COPY package.json package-lock.json* ./
RUN npm ci

COPY . .

RUN npm run build

# === Production runtime image ===
FROM node:24-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Prod node_modules (no canvas/puppeteer) from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Built Next.js output from builder stage
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/next.config.js ./next.config.js
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY --from=builder /app/server.ts ./server.ts
COPY --from=builder /app/src ./src
COPY --from=builder /app/migrations ./migrations

EXPOSE 3000

CMD ["npm", "start"]
