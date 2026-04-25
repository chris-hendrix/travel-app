# Journiful

Itineraries in 2 minutes. Collaborative trip planning for groups — shared itineraries, RSVPs, and phone-native invites.

## Quick Start

```bash
make install                                       # Install workspace dependencies
make up                                            # Start PostgreSQL + MinIO
cp apps/api/.env.example apps/api/.env             # Backend env (set JWT_SECRET, DATABASE_URL)
cp apps/web/.env.local.example apps/web/.env.local # Frontend env
make migrate                                       # Run database migrations
make dev                                           # Run web (3000) + api (8000)
```

Requires **Node.js 22+**, **pnpm 10+**, and **Docker** with Compose v2.

## Ports

| Service        | Port  | URL                            |
| -------------- | ----- | ------------------------------ |
| Web frontend   | 3000  | http://localhost:3000          |
| API backend    | 8000  | http://localhost:8000          |
| PostgreSQL     | 5433  | localhost:5433                 |
| MinIO API      | 9000  | http://localhost:9000          |
| MinIO Console  | 9001  | http://localhost:9001          |

## Stack

| Layer         | Technology                            |
| ------------- | ------------------------------------- |
| Monorepo      | pnpm workspaces + Turbo               |
| Frontend      | Next.js 16, React 19, Tailwind CSS 4  |
| UI components | shadcn/ui                             |
| Backend       | Fastify 5, Drizzle ORM                |
| Database      | PostgreSQL 16                         |
| Validation    | Zod (shared between web and api)      |
| Testing       | Vitest, Playwright                    |
| Runtime       | Node.js 22                            |

## Docs

- [AGENTS.md](AGENTS.md) — Project conventions, dev workflow, and constraints (read this first when contributing)
- [DEPLOYMENT.md](DEPLOYMENT.md) — Railway topology and production deploy
