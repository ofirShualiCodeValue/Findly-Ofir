FROM node:20-alpine AS builder

WORKDIR /app

ARG GITHUB_TOKEN
ENV GITHUB_TOKEN=$GITHUB_TOKEN

COPY package.json package-lock.json* .npmrc ./
RUN npm ci

COPY tsconfig.json ./
COPY config.ts ./
COPY src ./src

RUN npm run build

RUN rm -f .npmrc


FROM node:20-alpine AS runner

WORKDIR /app

ARG GITHUB_TOKEN
ENV GITHUB_TOKEN=$GITHUB_TOKEN
ENV NODE_ENV=production

RUN addgroup -S app && adduser -S app -G app

COPY package.json package-lock.json* .npmrc ./
# Keep `sequelize-cli` available so the entrypoint can run migrations on
# startup. Everything else stays prod-only via --omit=dev.
RUN npm ci --omit=dev && npm install --no-save sequelize-cli@^6 && rm -f .npmrc

COPY --from=builder /app/dist ./dist

# Entrypoint runs DB migrations against the configured DB, then exec's
# the server. Idempotent — sequelize-cli skips already-applied migrations.
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

RUN mkdir -p /app/uploads && chown -R app:app /app/uploads

USER app

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "dist/src/server.js"]
