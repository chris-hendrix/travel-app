# Development Setup

This document describes how to set up and run the Journiful development environment.

## Prerequisites

- Node.js 22+
- pnpm 10+
- Docker and Docker Compose v2+

## Quick Start

### 1. Install Dependencies

```bash
pnpm install
```

### 2. Set Up Environment Files

Environment files have already been created:

- `apps/api/.env` - API configuration (database URL, JWT secret, uploads, etc.)
- `apps/web/.env.local` - Web app configuration (API URL)

To customize, copy from the example files:

```bash
# API environment (if needed)
cp apps/api/.env.example apps/api/.env

# Web environment (if needed)
cp apps/web/.env.local.example apps/web/.env.local
```

**Additional Environment Variables:**

File upload configuration:

- `UPLOAD_DIR` - Directory for uploaded files (default: `uploads`)
- `MAX_FILE_SIZE` - Maximum upload file size in bytes (default: `5242880` = 5MB)
- `ALLOWED_MIME_TYPES` - Comma-separated allowed MIME types (default: `image/jpeg,image/png,image/webp`)

Security and behavior flags (optional, sensible defaults):

- `LOG_LEVEL` - Logging verbosity: fatal|error|warn|info|debug|trace (default: `info`)
- `COOKIE_SECURE` - Secure cookie flag (default: `true` in production)
- `EXPOSE_ERROR_DETAILS` - Include error details in API responses (default: `true` in development)
- `ENABLE_FIXED_VERIFICATION_CODE` - Allow code "123456" for testing (default: `true` in non-production)

See `apps/api/.env.example` for the full list with comments.

### 3. Start PostgreSQL

```bash
pnpm docker:up
```

This starts PostgreSQL 16 in a Docker container on port 5433.

### 4. Start Development Servers

```bash
pnpm dev
```

This starts both servers in parallel using Turbo:

- Web app: http://localhost:3000
- API: http://localhost:8000

## Docker Commands

The following convenience scripts are available:

```bash
# Start PostgreSQL
pnpm docker:up

# Stop PostgreSQL
pnpm docker:down

# View PostgreSQL logs
pnpm docker:logs
```

## Development Commands

```bash
# Start all dev servers (parallel)
pnpm dev

# Start only web
pnpm dev:web

# Start only API
pnpm dev:api

# Build all
pnpm build

# Build specific app
pnpm build:web
pnpm build:api

# Run tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Type checking
pnpm typecheck

# Linting
pnpm lint
pnpm lint:fix

# Formatting
pnpm format
pnpm format:check

# Clean
pnpm clean
pnpm clean:cache
```

## Hot Reload

Hot reload is enabled for both applications:

- **Web (Next.js):** Built-in Fast Refresh automatically reloads when you save files
- **API (Fastify + tsx):** Server automatically restarts when you save TypeScript files

Test it by:

1. Start `pnpm dev`
2. Edit any file in `apps/web` or `apps/api`
3. Save the file
4. See the changes reflected automatically

## Database

### Connection Details

- Host: localhost
- Port: 5433 (maps to container's 5432)
- Database: journiful
- User: journiful
- Password: journiful_dev

### Connection URL

```
postgresql://journiful:journiful_dev@localhost:5433/journiful
```

### Drizzle ORM Commands

```bash
# Generate migrations
cd apps/api
pnpm db:generate

# Run migrations
pnpm db:migrate

# Open Drizzle Studio
pnpm db:studio
```

## Testing the Setup

Automated test scripts are available in the `scripts/` directory:

```bash
# Test Docker Compose configuration
./scripts/test-docker-compose.sh

# Full integration test (Docker + dev servers + API)
./scripts/verify-dev-setup.sh

# Check hot reload configuration
./scripts/test-hot-reload.sh
```

## Architecture

The project is a monorepo with the following structure:

```
journiful/
├── apps/
│   ├── api/          # Fastify backend (port 8000) - plugin architecture with buildApp()
│   └── web/          # Next.js frontend (port 3000)
├── shared/           # Shared types, Zod schemas, and utilities (@journiful/shared)
├── docker-compose.yml
└── turbo.json        # Turborepo configuration
```

### API Server

- **Framework:** Fastify 5 (plugin architecture with `buildApp()` factory)
- **Language:** TypeScript (strict mode)
- **ORM:** Drizzle (with relations, transactions, pagination)
- **Security:** Helmet, rate limiting, Zod route schemas, typed errors
- **Port:** 8000
- **Hot Reload:** tsx watch mode

### Web Server

- **Framework:** Next.js 16 (App Router)
- **Language:** TypeScript + React 19
- **Styling:** Tailwind CSS v4
- **Port:** 3000
- **Hot Reload:** Next.js Fast Refresh

### Database

- **Engine:** PostgreSQL 16 (Alpine)
- **Container:** journiful-postgres
- **Port:** 5433 (external) → 5432 (internal)
- **Volume:** Persistent storage with postgres_data

## CORS Configuration

The API is configured to accept requests from `http://localhost:3000` by default (set via `FRONTEND_URL` env var). CORS is configured in `apps/api/src/app.ts` via `buildApp()`.

## Troubleshooting

### Ports Already in Use

If ports 3000 or 8000 are in use:

```bash
# Find and kill processes
lsof -ti:3000 | xargs kill -9
lsof -ti:8000 | xargs kill -9
```

### Database Connection Issues

```bash
# Check PostgreSQL is running
docker compose ps

# Check PostgreSQL logs
pnpm docker:logs

# Restart PostgreSQL
pnpm docker:down
pnpm docker:up
```

### Dev Servers Not Starting

```bash
# Clean and reinstall
pnpm clean
pnpm install

# Restart with fresh cache
pnpm clean:cache
pnpm dev
```

## Health Checks

### API Health Endpoints

```bash
# Full health status (includes database check)
curl http://localhost:8000/api/health

# Liveness probe (instant 200, no dependency checks)
curl http://localhost:8000/api/health/live

# Readiness probe (returns 503 if database is unavailable)
curl http://localhost:8000/api/health/ready
```

Expected response for `/api/health`:

```json
{
  "status": "ok",
  "timestamp": "2026-02-01T...",
  "database": "connected"
}
```

### PostgreSQL Health

```bash
docker compose exec postgres pg_isready -U journiful
```

Expected: `localhost:5432 - accepting connections`

## Next Steps

1. Review the API routes in `apps/api/src/routes/`
2. Explore the web pages in `apps/web/src/app/`
3. Check shared utilities in `shared/`
4. Set up database migrations with Drizzle
5. See `docs/2026-02-01-journiful-mvp/PHASES.md` for implementation status

## Support

For issues or questions, check:

- Project documentation in `/docs`
- Test scripts in `/scripts`
- Git history for implementation examples
