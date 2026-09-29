# Journiful

Itineraries in 2 minutes. Collaborative trip planning for groups — shared itineraries, RSVPs, and phone-native invites.

## Quick Start

```bash
make install                                       # Install workspace dependencies
make up                                            # Start PostgreSQL + MinIO
cp apps/api/.env.example apps/api/.env             # Backend env (set JWT_SECRET, DATABASE_URL)
make migrate                                       # Run database migrations
make dev                                           # Run Expo web (8081) + api (8000)
```

```bash
# Optional: build the Android APK from apps/mobile (see apps/mobile/AGENTS.md)
make android-apk
```

Requires **Node.js 22+**, **pnpm 10+**, and **Docker** with Compose v2.

## Ports

| Service        | Port  | URL                            |
| -------------- | ----- | ------------------------------ |
| Expo web / mockup | 8081 | http://localhost:8081          |
| API backend    | 8000  | http://localhost:8000          |
| PostgreSQL     | 5433  | localhost:5433                 |
| MinIO API      | 9000  | http://localhost:9000          |
| MinIO Console  | 9001  | http://localhost:9001          |
| Android emulator | —   | adb over TCP:5037              |

## Stack

| Layer         | Technology                            |
| ------------- | ------------------------------------- |
| Monorepo      | pnpm workspaces + Turbo               |
| App           | Expo 57, React Native, NativeWind     |
| Backend       | Fastify 5, Drizzle ORM                |
| Database      | PostgreSQL 16                         |
| Validation    | Zod (shared between the app and the api) |
| Testing       | Vitest, Playwright                    |
| Mobile        | Expo 57 (expo-router, NativeWind), Firebase Cloud Messaging |
| Runtime       | Node.js 22                            |

## Docs

- [AGENTS.md](AGENTS.md) — Project conventions, dev workflow, and constraints (read this first when contributing)
- [DEPLOYMENT.md](DEPLOYMENT.md) — Railway topology and production deploy
