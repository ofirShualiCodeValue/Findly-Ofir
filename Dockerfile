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
RUN npm ci --omit=dev && rm -f .npmrc

COPY --from=builder /app/dist ./dist

RUN mkdir -p /app/uploads && chown -R app:app /app/uploads

USER app

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

CMD ["node", "dist/src/server.js"]
