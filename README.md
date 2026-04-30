# Findly Server

Backend server for **Findly** — a platform that connects employers running events with employees who staff them. The server hosts two distinct apps that share a single database and a single Express process:

| App | Audience | Path prefix |
|-----|----------|-------------|
| **Employer** | Businesses creating events, approving employees, sending notifications | `/v1/employer` |
| **Employee** | Workers applying to events, receiving updates | `/v1/employee` |
| **Shared** | Auth, push tokens, reference data | `/v1/shared` |

Built on top of [`@monkeytech/nodejs-core`](https://github.com/monkeytech/nodejs-core) — Monkeytech's internal backend foundation (auth, notifications, ORM helpers, etc.).

---

## Stack

| Layer | Technology |
|-------|-----------|
| Language | TypeScript (ES2022) |
| Runtime | Node.js >= 18 |
| Framework | Express 4 |
| Database | PostgreSQL 16 (via Sequelize 6 + sequelize-typescript) |
| Cache | Redis 7 |
| Auth | JWT (via `@monkeytech/nodejs-core/authentication`) |
| Container | Docker / docker-compose |

---

## Prerequisites

1. **Node.js >= 18** and **npm >= 9**
2. **Docker** + **docker-compose** (for local Postgres/Redis)
3. **GitHub Personal Access Token** with `read:packages` scope — needed to install `@monkeytech/nodejs-core` from GitHub Packages

---

## First-time setup

### 1. Set your GitHub token

The `.npmrc` in this repo references `${GITHUB_TOKEN}`. Set it in your shell environment **before** running `npm install`:

```bash
# bash / zsh
export GITHUB_TOKEN=ghp_your_personal_access_token

# Windows PowerShell
$env:GITHUB_TOKEN = "ghp_your_personal_access_token"
```

> **Do not** commit the token. Do not paste it into `.npmrc`. The placeholder `${GITHUB_TOKEN}` is resolved by npm at install time from the environment.

### 2. Copy the env file

```bash
cp .env.example .env
```

Edit `.env` and set at minimum a real `JWT_SECRET`.

### 3. Install dependencies

```bash
npm install
```

### 4. Start Postgres + Redis

```bash
docker-compose up -d postgres redis
```

### 5. Run migrations

```bash
npm run db:migrate
```

### 6. Start the dev server

```bash
npm run dev
```

Server will be at `http://localhost:3000`. Verify with:

```bash
curl http://localhost:3000/health
```

---

## Project structure

```
findly-server/
├── config.ts                        # convict-based root config
├── docker-compose.yml               # app + postgres + redis
├── Dockerfile                       # multi-stage build
├── .corerc                          # nodejs-core CLI config
├── .sequelizerc                     # sequelize-cli paths
└── src/
    ├── server.ts                    # HTTP entry, graceful shutdown
    ├── worker.ts                    # background jobs (TODO)
    ├── app.ts                       # express middleware + error handler
    ├── app/
    │   ├── api/
    │   │   ├── main.ts              # mounts /v1/{shared,employer,employee}
    │   │   └── v1/
    │   │       ├── handlers/        # controllers, split per app
    │   │       │   ├── employer/
    │   │       │   ├── employee/
    │   │       │   └── shared/
    │   │       ├── entities/        # DTO serializers (Entity from core)
    │   │       └── common/
    │   ├── models/                  # Sequelize-typescript models (shared DB)
    │   └── mailers/                 # EJS email templates
    ├── config/
    │   ├── auth/
    │   ├── cors.ts
    │   ├── database.json            # sequelize-cli config
    │   └── initializers/            # env, database, cache, jwt, ...
    ├── db/
    │   ├── connection.ts
    │   ├── migrations/
    │   └── seeds/
    ├── jobs/                        # background workers
    ├── lib/keys/                    # JWT signing keys (gitignored)
    └── utils/
```

### Why two apps in one server?

The product is two mobile apps backed by one company's data — both read and write the same `User`, `Event`, `Notification` tables. Splitting into microservices would mean every read of a `User` crosses the network. Instead, we follow the **smartclass-server pattern**: a single Express process, single database, but **handlers are split per audience** so each app only exposes the endpoints relevant to it. The boundary is at the routing layer, not at the data layer.

---

## Common scripts

| Command | What it does |
|---------|--------------|
| `npm run dev` | Run server with hot reload (`ts-node-dev`) |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run compiled server (`node dist/src/server.js`) |
| `npm run type-check` | Run `tsc --noEmit` |
| `npm run db:migrate` | Apply pending migrations |
| `npm run db:rollback` | Roll back the last migration |
| `npm run g:migration -- --name CreateUsers` | Generate a new migration file |

---

## nodejs-core CLI

`@monkeytech/nodejs-core` ships with a `core` CLI that scaffolds modules into the project. Once dependencies are installed, run:

```bash
npx core install authentication    # adds auth migrations + models
npx core install authorization     # adds RBAC migrations + models
npx core install notifications     # adds multi-channel notifications
```

The `.corerc` file at the repo root tells the CLI where to drop generated files.

---

## Docker

### Run everything in Docker

```bash
GITHUB_TOKEN=ghp_xxx docker-compose up --build
```

### Build only the app image

```bash
docker build --build-arg GITHUB_TOKEN=$GITHUB_TOKEN -t findly-server .
```

> **Production note:** the current Dockerfile passes `GITHUB_TOKEN` as a build ARG, which leaves it in image layer history. For production builds, switch to BuildKit secrets (`RUN --mount=type=secret,id=npmrc ...`).

---

## API surface

For the full interactive API reference start the server and open **http://localhost:3000/docs/** (Swagger UI). The OpenAPI 3.0.3 spec is also available as JSON at `/docs.json`.

Internal phase-by-phase progress is tracked in `STATUS.md` (gitignored — local only).
