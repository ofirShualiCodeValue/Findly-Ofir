# Findly Server

Backend server for **Findly** — a platform that connects employers running events with employees who staff them. The server hosts two distinct apps that share a single database and a single Express process:

| App | Audience | Path prefix |
|-----|----------|-------------|
| **Employer** | Businesses creating events, approving employees, sending notifications | `/v1/employer` |
| **Employee** | Workers applying to events, receiving updates | `/v1/employee` |
| **Shared** | Auth, push tokens, reference data | `/v1/shared` |

Built on top of [`@monkeytech/nodejs-core`](https://github.com/monkeytech/nodejs-core) — Monkeytech's internal backend foundation (auth, notifications, ORM helpers, etc.).

---

## ⚡ Quick Start (Docker)

From a fresh clone, this is everything you need. Each step is explained in detail below.

```bash
# 1. Create .env from the template
cp .env.example .env

# 2. Edit .env and set:
#      GITHUB_TOKEN=ghp_your_personal_access_token   (read:packages scope)
#      JWT_SECRET=any_long_random_string

# 3. Make sure Docker Desktop is running, then:
docker compose up -d --build

# 4. Run migrations + seeds (first time, then again whenever a new
#    migration is added). Note: the runtime image is built with
#    --omit=dev and has no ts-node, so we run the CLI in a one-off
#    node:20-alpine container that joins the same docker network.
docker run --rm \
  --network findly-server_findly-net \
  -v "$(pwd):/app" -w /app \
  -e DB_HOST=postgres -e DB_PORT=5432 \
  -e DB_USER=findly -e DB_PASSWORD="$(grep ^DB_PASSWORD .env | cut -d= -f2)" \
  -e DB_NAME=findly_dev \
  node:20-alpine \
  sh -c "npx ts-node ./node_modules/sequelize-cli/lib/sequelize db:migrate && \
         npx ts-node ./node_modules/sequelize-cli/lib/sequelize db:seed:all"

# 5. Verify
curl http://localhost:3000/health
```

**Done.** App is at http://localhost:3000, Swagger at http://localhost:3000/docs/.

---

## 📋 Prerequisites

| | Required for |
|---|---|
| **Docker Desktop** running | Docker mode (recommended) |
| **Node.js >= 18** + **npm >= 9** | Local mode only |
| **GitHub Personal Access Token** with `read:packages` scope | Both modes — used to install `@monkeytech/nodejs-core` from GitHub Packages |

---

## 🔑 GitHub Token

The package `@monkeytech/nodejs-core` is hosted on **GitHub Packages** (private), so `npm install` needs an authenticated token.

The token is read from the `GITHUB_TOKEN` environment variable, which `.npmrc` references via `${GITHUB_TOKEN}`. **Never paste the token into `.npmrc` directly** — both `.env` and `.npmrc` are gitignored, but a token in a config file is easier to leak by mistake.

| Mode | Where to put the token |
|------|------------------------|
| Docker | In `.env` — docker-compose reads it automatically |
| Local | Export it in your shell before `npm install` |

```bash
# Local mode — Windows PowerShell
$env:GITHUB_TOKEN = "ghp_xxx"

# Local mode — bash / zsh
export GITHUB_TOKEN=ghp_xxx
```

---

## 🐳 Run with Docker (recommended)

Single command brings up all four containers: `findly-app`, `findly-postgres`, `findly-redis`, `findly-pgadmin`.

### First-time setup

```bash
cp .env.example .env
# edit .env — set GITHUB_TOKEN and JWT_SECRET
docker compose up -d --build

# Apply migrations + seeds (industries, event categories, activity areas).
# The runtime image has no ts-node, so we run the CLI in a one-off
# node:20-alpine container that joins the same docker network.
docker run --rm \
  --network findly-server_findly-net \
  -v "$(pwd):/app" -w /app \
  -e DB_HOST=postgres -e DB_PORT=5432 \
  -e DB_USER=findly -e DB_PASSWORD="$(grep ^DB_PASSWORD .env | cut -d= -f2)" \
  -e DB_NAME=findly_dev \
  node:20-alpine \
  sh -c "npx ts-node ./node_modules/sequelize-cli/lib/sequelize db:migrate && \
         npx ts-node ./node_modules/sequelize-cli/lib/sequelize db:seed:all"
```

### Services

| Service | URL / Port | Notes |
|---------|------------|-------|
| App | http://localhost:3000 | Express server |
| Swagger | http://localhost:3000/docs/ | Interactive API docs |
| pgAdmin | http://localhost:5050 | Login: `admin@findly.local` / `admin` |
| Postgres | `localhost:5433` → container `5432` | |
| Redis | `localhost:6379` | |

### Daily commands

```bash
docker compose up -d                 # start (uses existing image)
docker compose up -d --build         # rebuild image then start
docker compose down                  # stop, KEEP database data
docker compose down -v               # stop and DELETE database data ⚠️
docker compose ps                    # status of all services
docker compose logs -f app           # follow app logs (Ctrl+C to exit)
docker compose restart app           # restart only the app container
docker compose exec app sh           # open shell inside the app container
```

> **Migrations note:** the runtime image has no `ts-node`, so
> `docker compose exec app npm run db:migrate` will fail with
> `sh: ts-node: not found`. Use the one-off container command shown in
> "First-time setup" above whenever you add a new migration.

> **Local Postgres conflict on Windows**: if you have a native
> `postgresql-x64-XX` service running, it claims port `5432` and you'll get
> `password authentication failed` connecting from the host. Either stop
> the service (`net stop postgresql-x64-18`) or change `DB_PORT=5433`
> in `.env` (and rebuild postgres) — the docker network is unaffected.

---

## 💻 Run locally (without Docker)

Faster iteration during development — `npm run dev` gives hot reload, while Postgres + Redis still come from Docker.

### First-time setup

```bash
# 1. Set the token in your shell
$env:GITHUB_TOKEN = "ghp_xxx"   # PowerShell
# or: export GITHUB_TOKEN=ghp_xxx   # bash

# 2. Copy env template
cp .env.example .env

# 3. Install deps
npm install

# 4. Start only Postgres + Redis from docker-compose
docker compose up -d postgres redis

# 5. Migrate the DB
npm run db:migrate

# 6. Run dev server
npm run dev
```

### Daily commands

| Command | What it does |
|---------|--------------|
| `npm run dev` | Run server with hot reload (`ts-node-dev`) |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run compiled server (`node dist/src/server.js`) |
| `npm run type-check` | Run `tsc --noEmit` |
| `npm run db:migrate` | Apply pending migrations |
| `npm run db:rollback` | Roll back the last migration |
| `npm run db:rollback:all` | Roll back every migration |
| `npm run db:seed` | Run seed files |
| `npm run g:migration -- --name CreateUsers` | Generate a new migration file |

---

## 🛠️ Stack

| Layer | Technology |
|-------|-----------|
| Language | TypeScript (ES2022) |
| Runtime | Node.js >= 18 |
| Framework | Express 4 |
| Database | PostgreSQL 16 (Sequelize 6 + sequelize-typescript) |
| Cache | Redis 7 |
| Auth | JWT (via `@monkeytech/nodejs-core/authentication`) |
| Container | Docker / docker-compose |

---

## 📁 Project structure

```
findly-server/
├── config.ts                        # convict-based root config
├── docker-compose.yml               # app + postgres + redis + pgadmin
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

## 🧰 nodejs-core CLI

`@monkeytech/nodejs-core` ships with a `core` CLI that scaffolds modules into the project. Once dependencies are installed:

```bash
npx core install authentication    # adds auth migrations + models
npx core install authorization     # adds RBAC migrations + models
npx core install notifications     # adds multi-channel notifications
```

The `.corerc` file at the repo root tells the CLI where to drop generated files.

---

## 🔐 Authenticating in Swagger UI

Almost every endpoint requires a JWT (Bearer token). To get one:

1. Open http://localhost:3000/docs/
2. Find **`POST /v1/shared/auth/sms/request`** under the `Authentication` tag → **Try it out**:
   ```json
   {
     "phone": "0536298799",
     "role": "employer",
     "full_name": "אופיר שועלי"
   }
   ```
   Click **Execute**. The response includes `dev_code` (only in development).
3. Find **`POST /v1/shared/auth/sms/verify`** → **Try it out**:
   ```json
   {
     "phone": "0536298799",
     "code": "<the dev_code from step 2>"
   }
   ```
   The response includes `token`.
4. Copy the `token`, click **Authorize** (top right), paste it (without the word `Bearer`), then **Authorize** → **Close**.
5. Try `GET /v1/employer/profile` to verify.

> **Note:** the OTP rotates after every successful login — always use the latest `dev_code`.

The OpenAPI 3.0.3 spec is also available as JSON at `/docs.json`.

Internal phase-by-phase progress is tracked in `STATUS.md` (gitignored — local only).
