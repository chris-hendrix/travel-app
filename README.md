# Journiful

Itineraries in 2 minutes.

## Table of Contents

- [Project Overview](#project-overview)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Running Development](#running-development)
- [Project Structure](#project-structure)
- [Available Scripts](#available-scripts)
- [Environment Variables](#environment-variables)
- [Testing](#testing)
- [Troubleshooting](#troubleshooting)
- [Quick Reference](#quick-reference)
- [Additional Documentation](#additional-documentation)

## Project Overview

Journiful is a modern travel itinerary planning application built as a full-stack monorepo. This repository contains Phases 1-6 plus a frontend design overhaul:

- **Frontend**: Next.js 16 web application with React 19, Tailwind CSS 4, and a Mediterranean-inspired design system
- **Backend**: Fastify REST API with PostgreSQL database (plugin architecture)
- **Shared**: Common utilities, types, and Zod schemas used across applications

### Current Scope (Phases 1-6 + Design Overhaul)

The current implementation includes:

- Complete monorepo setup with pnpm workspaces and Turbo
- Full development environment with Docker Compose
- Next.js frontend with modern UI components (shadcn/ui) and Vivid Capri design system
- App shell with header navigation, user dropdown menu, and skip link
- Playfair Display + Plus Jakarta Sans typography via `next/font/google`
- Toast notifications (Sonner), breadcrumbs, skeleton loading states
- Fastify backend with plugin architecture and `buildApp()` factory pattern
- SMS authentication with JWT, phone verification, and profile completion
- Trip management with CRUD operations, co-organizers, and image uploads
- Itinerary management with events (travel, meals, activities), accommodations, and member travel
- Day-by-day and group-by-type itinerary view modes with timezone toggle
- Soft delete and restore for itinerary items with deleted items section (organizer-only restore UI)
- Meetup coordination: meetup location and time fields on events
- Auto-lock past trips: prevents modifications after trip end date
- Member removal: organizers can remove accepted members from trips
- Multi-day event badges in both view modes
- Invitation system with batch phone-number invite flow and trip preview for invitees
- RSVP management (Going/Maybe/Not Going) with member status badges
- Members dialog with organizer controls (invite, remove member)
- Fine-grained permissions with `isOrganizer` column on members table
- Security hardening: Helmet, rate limiting, Zod route schemas, typed errors
- Response schemas on all Fastify routes
- Drizzle ORM with relations, transactions, and pagination
- Health check endpoints (`/health`, `/health/live`, `/health/ready`)
- Comprehensive testing (Vitest unit/integration, Playwright E2E)
- Git hooks with Husky, lint-staged, and Prettier

## Prerequisites

Before you begin, ensure you have the following installed:

### Required Software

- **Node.js**: Version 22.0.0 or higher
- **pnpm**: Version 10.0.0 or higher
- **Docker**: Latest version with Docker Compose v2+

### Version Checks

Verify your installations:

```bash
# Check Node.js version (should be 22.x or higher)
node --version

# Check pnpm version (should be 10.x or higher)
pnpm --version

# Check Docker version
docker --version

# Check Docker Compose version (should be v2.x or higher)
docker compose version
```

### Installing Prerequisites

If you need to install any prerequisites:

**Node.js**: Download from [nodejs.org](https://nodejs.org/) or use a version manager like [nvm](https://github.com/nvm-sh/nvm) or [fnm](https://github.com/Schniz/fnm).

**pnpm**: Install via npm:

```bash
npm install -g pnpm@latest
```

**Docker**: Follow the installation guide at [docs.docker.com](https://docs.docker.com/get-docker/).

## Installation

Follow these steps to set up the project from scratch:

### 1. Clone the Repository

```bash
git clone <repository-url>
cd journiful
```

### 2. Install Dependencies

Install all workspace dependencies using pnpm:

```bash
pnpm install
```

This will install dependencies for:

- Root workspace
- Frontend application (`apps/web`)
- Backend API (`apps/api`)
- Shared package (`shared`)

### 3. Set Up Environment Files

Environment files are already created with sensible defaults. For development, you can use them as-is:

- `apps/api/.env` - Backend API configuration
- `apps/web/.env.local` - Frontend web configuration

To customize or review the defaults, copy from example files:

```bash
# Review API environment variables
cat apps/api/.env.example

# Review web environment variables
cat apps/web/.env.local.example

# Customize if needed
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.local.example apps/web/.env.local
```

See the [Environment Variables](#environment-variables) section for detailed documentation.

### 4. Start PostgreSQL Database

Start the PostgreSQL database using Docker Compose:

```bash
pnpm docker:up
```

This starts PostgreSQL 16 in a Docker container with:

- External port: 5433 (mapped to internal 5432)
- Database name: `journiful`
- Username: `journiful`
- Password: `journiful_dev`
- Persistent data volume: `postgres_data`

Verify the database is running:

```bash
# Check container status
docker compose ps

# Check database health
docker compose exec postgres pg_isready -U journiful
```

You should see: `localhost:5432 - accepting connections`

### 5. Set Up Pre-commit Hooks (Automatic)

Pre-commit hooks are already configured with Husky! They will automatically:

- **Scan for secrets**: Uses GitGuardian ggshield via Docker to detect hardcoded credentials
- **Prevent sensitive data commits**: Blocks commits if secrets are found

**No setup required** - the hooks are automatically installed when you run `pnpm install`.

**Requirements**:

- Docker must be installed and running (already needed for the database)
- If Docker is not available, the hook will skip with a warning

**Manual scan** (test the hook):

```bash
# Scan staged changes
docker run --rm -v "$(pwd):/data" gitguardian/ggshield:latest ggshield secret scan pre-commit

# Scan entire repository
docker run --rm -v "$(pwd):/data" gitguardian/ggshield:latest ggshield secret scan repo .
```

**Optional: GitGuardian API key** (for dashboard features):

```bash
# Sign up at dashboard.gitguardian.com to get a key
export GITGUARDIAN_API_KEY="your-api-key-here"
# Add to ~/.bashrc or ~/.zshrc to persist
```

### 6. Verify Installation

Run a comprehensive test to verify everything is set up correctly:

```bash
./scripts/verify-dev-setup.sh
```

This tests Docker, database connectivity, environment files, and more.

## Running Development

### Start All Development Servers

Start both the web frontend and API backend in parallel:

```bash
pnpm dev
```

This command uses Turbo to run both servers concurrently with hot reload enabled.

### Access the Applications

Once started, you can access:

- **Web Frontend**: [http://localhost:3000](http://localhost:3000)
- **API Backend**: [http://localhost:8000](http://localhost:8000)
- **API Health Check**: [http://localhost:8000/api/health](http://localhost:8000/api/health)

### Start Individual Servers

To run servers separately:

```bash
# Start only the web frontend
pnpm dev:web

# Start only the API backend
pnpm dev:api
```

### Hot Reload

Both applications support hot reload during development:

- **Frontend (Next.js)**: Fast Refresh automatically reloads when you save files in `apps/web`
- **Backend (Fastify)**: Server restarts automatically when you save TypeScript files in `apps/api`

Test hot reload:

1. Start `pnpm dev`
2. Edit any file in `apps/web` or `apps/api`
3. Save the file
4. See changes reflected automatically

### Database Management

The API uses Drizzle ORM for database management. Common database commands:

```bash
# Navigate to API directory
cd apps/api

# Generate migrations from schema changes
pnpm db:generate

# Run pending migrations
pnpm db:migrate

# Open Drizzle Studio (visual database browser)
pnpm db:studio

# Return to root
cd ../..
```

Database connection details:

- **Host**: localhost
- **Port**: 5433
- **Database**: journiful
- **User**: journiful
- **Password**: journiful_dev
- **Connection URL**: `postgresql://journiful:journiful_dev@localhost:5433/journiful`

### Docker Commands

Convenience scripts for Docker management:

```bash
# Start PostgreSQL container
pnpm docker:up

# Stop PostgreSQL container
pnpm docker:down

# View PostgreSQL logs (follow mode)
pnpm docker:logs
```

## Project Structure

The monorepo is organized as follows:

```
journiful/
├── apps/                      # Application packages
│   ├── api/                   # Fastify backend API
│   │   ├── src/
│   │   │   ├── app.ts         # buildApp() factory (configures FastifyInstance)
│   │   │   ├── server.ts      # Production entry point
│   │   │   ├── errors.ts      # Typed errors via @fastify/error
│   │   │   ├── plugins/       # Fastify plugins (service injection)
│   │   │   ├── routes/        # API route handlers (Zod schema validation)
│   │   │   ├── controllers/   # Request handlers
│   │   │   ├── services/      # Business logic
│   │   │   ├── middleware/    # Auth, error handling, rate limiting
│   │   │   ├── config/        # Environment and database config
│   │   │   └── db/            # Schema definitions and migrations
│   │   ├── tests/             # Unit and integration tests
│   │   ├── .env.example       # Environment variables template
│   │   └── package.json       # API dependencies and scripts
│   │
│   └── web/                   # Next.js frontend
│       ├── src/               # Source code
│       │   ├── app/           # Next.js App Router pages
│       │   │   ├── page.tsx   # Home page
│       │   │   └── layout.tsx # Root layout
│       │   ├── components/    # React components
│       │   │   ├── ui/        # shadcn/ui components
│       │   │   └── ...        # Custom components
│       │   └── lib/           # Utilities and configurations
│       ├── .env.local.example # Environment variables template
│       └── package.json       # Web dependencies and scripts
│
├── shared/                    # Shared package (monorepo internal)
│   ├── types/                 # TypeScript type definitions
│   ├── schemas/               # Zod validation schemas
│   ├── utils/                 # Shared utility functions
│   ├── __tests__/             # Unit tests
│   ├── index.ts               # Main exports
│   └── package.json           # Shared package config
│
├── scripts/                   # Development and test scripts
│   ├── verify-dev-setup.sh    # Comprehensive setup verification
│   ├── test-workflow.sh       # Full monorepo workflow test
│   ├── test-git-hooks.sh      # Git hooks verification
│   └── README.md              # Scripts documentation
│
├── docs/                      # Additional documentation
│   ├── GIT_HOOKS.md           # Git hooks setup guide
│   └── 2026-02-01-journiful-mvp/  # MVP documentation
│       ├── ARCHITECTURE.md    # High-level architecture (implementation progress)
│       ├── PHASES.md          # Implementation phases and status
│       ├── DESIGN.md          # UI/UX design system documentation
│       └── PRD.md             # Product requirements document
│
├── .husky/                    # Git hooks (Husky)
│   └── pre-commit             # Pre-commit hook script
│
├── docker-compose.yml         # PostgreSQL container configuration
├── turbo.json                 # Turborepo configuration
├── pnpm-workspace.yaml        # pnpm workspace definition
├── package.json               # Root package with scripts
├── tsconfig.base.json         # Base TypeScript configuration
├── eslint.config.js           # ESLint flat configuration
├── .prettierrc.json           # Prettier configuration
├── DEVELOPMENT.md             # Detailed development guide
└── README.md                  # This file
```

### Key Directories

- **apps/api**: Fastify backend with REST API endpoints, database integration via Drizzle ORM, and health checks
- **apps/web**: Next.js 16 frontend with React 19, Tailwind CSS 4, and shadcn/ui components
- **shared**: Shared code imported as `@journiful/shared` in both frontend and backend
- **scripts**: Bash scripts for testing, verification, and automation
- **docs**: Additional documentation for specific topics

## Available Scripts

All scripts are run from the root directory using `pnpm`.

### Development Scripts

| Script         | Description                                           |
| -------------- | ----------------------------------------------------- |
| `pnpm dev`     | Start all development servers in parallel (web + api) |
| `pnpm dev:web` | Start only the web frontend server                    |
| `pnpm dev:api` | Start only the API backend server                     |

### Build Scripts

| Script           | Description                           |
| ---------------- | ------------------------------------- |
| `pnpm build`     | Build all applications for production |
| `pnpm build:web` | Build only the web frontend           |
| `pnpm build:api` | Build only the API backend            |

### Quality Assurance Scripts

| Script              | Description                                  |
| ------------------- | -------------------------------------------- |
| `pnpm lint`         | Run ESLint on all packages                   |
| `pnpm lint:fix`     | Run ESLint and automatically fix issues      |
| `pnpm format`       | Format all code with Prettier                |
| `pnpm format:check` | Check code formatting without making changes |
| `pnpm typecheck`    | Run TypeScript type checking on all packages |
| `pnpm test`         | Run all tests (unit and integration)         |
| `pnpm test:watch`   | Run tests in watch mode                      |

### Docker Scripts

| Script             | Description                                 |
| ------------------ | ------------------------------------------- |
| `pnpm docker:up`   | Start PostgreSQL container in detached mode |
| `pnpm docker:down` | Stop and remove PostgreSQL container        |
| `pnpm docker:logs` | Follow PostgreSQL container logs            |

### Maintenance Scripts

| Script             | Description                                             |
| ------------------ | ------------------------------------------------------- |
| `pnpm clean`       | Remove all node_modules, build outputs, and Turbo cache |
| `pnpm clean:cache` | Remove only Turbo cache directory                       |
| `pnpm prepare`     | Set up Git hooks (runs automatically after install)     |

### Database Scripts (from apps/api)

Navigate to `apps/api` directory first: `cd apps/api`

| Script             | Description                                   |
| ------------------ | --------------------------------------------- |
| `pnpm db:generate` | Generate migration files from schema changes  |
| `pnpm db:migrate`  | Run pending database migrations               |
| `pnpm db:studio`   | Open Drizzle Studio (visual database browser) |

### Test Scripts

Test scripts are located in the `scripts/` directory:

```bash
# Verify complete development setup
./scripts/verify-dev-setup.sh

# Test complete monorepo workflow (comprehensive)
./scripts/test-workflow.sh

# Quick workflow test (faster iteration)
./scripts/test-workflow-quick.sh

# Test Git hooks setup
./scripts/test-git-hooks.sh

# Test Docker Compose configuration
./scripts/test-docker-compose.sh
```

See [scripts/README.md](scripts/README.md) for detailed documentation on each test script.

## Environment Variables

### Backend API (apps/api/.env)

The API requires the following environment variables:

| Variable                         | Description                                                   | Default                           | Required |
| -------------------------------- | ------------------------------------------------------------- | --------------------------------- | -------- |
| `NODE_ENV`                       | Environment mode                                              | `development`                     | Yes      |
| `PORT`                           | API server port                                               | `8000`                            | Yes      |
| `HOST`                           | Server host binding                                           | `0.0.0.0`                         | Yes      |
| `DATABASE_URL`                   | PostgreSQL connection string                                  | See below                         | Yes      |
| `TEST_DATABASE_URL`              | Test database connection string                               | See below                         | No       |
| `JWT_SECRET`                     | Secret key for JWT token signing                              | Must change in production         | Yes      |
| `FRONTEND_URL`                   | Frontend URL for CORS                                         | `http://localhost:3000`           | Yes      |
| `LOG_LEVEL`                      | Logging verbosity (fatal\|error\|warn\|info\|debug\|trace)    | `info`                            | No       |
| `COOKIE_SECURE`                  | Secure cookie flag                                            | `true` in production              | No       |
| `EXPOSE_ERROR_DETAILS`           | Include error details in responses                            | `true` in development             | No       |
| `ENABLE_FIXED_VERIFICATION_CODE` | Allow fixed code "123456" for testing                         | `true` in non-production          | No       |
| `UPLOAD_DIR`                     | Directory for uploaded files                                  | `uploads`                         | No       |
| `MAX_FILE_SIZE`                  | Maximum upload file size in bytes                             | `5242880` (5MB)                   | No       |
| `ALLOWED_MIME_TYPES`             | Comma-separated allowed MIME types (must start with 'image/') | `image/jpeg,image/png,image/webp` | No       |

**Database URL Format**:

```
postgresql://[user]:[password]@[host]:[port]/[database]
```

**Default Database URL**:

```
postgresql://journiful:journiful_dev@localhost:5433/journiful
```

**Security Note**: The `JWT_SECRET` in `.env.example` is a placeholder. For production, generate a secure secret:

```bash
openssl rand -base64 32
```

See [apps/api/.env.example](apps/api/.env.example) for the complete template with detailed comments.

### Frontend Web (apps/web/.env.local)

The web application requires:

| Variable              | Description          | Default                     | Required |
| --------------------- | -------------------- | --------------------------- | -------- |
| `NEXT_PUBLIC_API_URL` | Backend API base URL | `http://localhost:8000/api` | Yes      |

**Note**: Variables prefixed with `NEXT_PUBLIC_` are exposed to the browser. Do not use this prefix for sensitive values.

See [apps/web/.env.local.example](apps/web/.env.local.example) for the complete template.

### Environment Setup

1. **Default Setup**: Environment files are pre-created with defaults that work out of the box
2. **Custom Setup**: Copy from `.example` files and modify as needed
3. **Production Setup**: Always change sensitive values (`JWT_SECRET`, database credentials) in production

## Testing

### Running Tests

The project includes comprehensive testing at multiple levels:

```bash
# Run all tests (unit + integration)
pnpm test

# Run tests in watch mode (auto-rerun on changes)
pnpm test:watch
```

### Test Coverage

**Backend API Tests** (`apps/api/tests/`):

- Health check endpoint integration tests
- Database connection validation
- API response format verification
- Error handling validation

**Shared Package Tests** (`shared/__tests__/`):

- Utility function unit tests
- Type validation tests
- Schema validation with Zod

### Integration Tests

Comprehensive integration tests are available as bash scripts:

```bash
# Test complete development setup
./scripts/verify-dev-setup.sh

# Test full monorepo workflow (build, cache, imports)
./scripts/test-workflow.sh

# Test Git hooks functionality
./scripts/test-git-hooks.sh
```

### Test Framework

- **Backend/Shared**: Vitest (unit and integration tests)
- **E2E**: Playwright (authentication flows, trip management, itinerary flows)
- **Integration Scripts**: Bash scripts for environment verification

### What is Tested

1. **Unit Tests**:
   - Shared utility functions
   - Schema validations
   - Type transformations

2. **Integration Tests**:
   - API health endpoints
   - Database connectivity
   - CORS configuration
   - Hot reload functionality
   - Docker Compose setup
   - Workspace resolution

3. **System Tests**:
   - Complete development workflow
   - Build process and caching (Turbo)
   - Git hooks and code quality checks
   - Cross-package imports (`@journiful/shared`)

## Troubleshooting

### Common Issues and Solutions

#### Port Conflicts

**Problem**: Error message "Port 3000 (or 8000) is already in use"

**Solution**: Kill the process using the port:

```bash
# For web frontend (port 3000)
lsof -ti:3000 | xargs kill -9

# For API backend (port 8000)
lsof -ti:8000 | xargs kill -9

# For PostgreSQL (port 5433)
lsof -ti:5433 | xargs kill -9
# Or stop the Docker container:
pnpm docker:down
```

#### Database Connection Issues

**Problem**: "Could not connect to database" or "Connection refused"

**Solutions**:

1. **Check PostgreSQL is running**:

```bash
docker compose ps
# Should show journiful-postgres as "running"
```

2. **Check database health**:

```bash
docker compose exec postgres pg_isready -U journiful
# Should show: localhost:5432 - accepting connections
```

3. **View PostgreSQL logs**:

```bash
pnpm docker:logs
```

4. **Restart PostgreSQL**:

```bash
pnpm docker:down
pnpm docker:up
```

5. **Verify environment variable**:

```bash
cat apps/api/.env | grep DATABASE_URL
# Should be: postgresql://journiful:journiful_dev@localhost:5433/journiful
```

#### Environment Variable Validation Errors

**Problem**: API fails to start with "Environment validation failed"

**Solutions**:

1. **Check .env file exists**:

```bash
ls -la apps/api/.env
```

2. **Verify all required variables are set**:

```bash
cat apps/api/.env
```

3. **Copy from example if missing**:

```bash
cp apps/api/.env.example apps/api/.env
```

4. **Generate secure JWT_SECRET**:

```bash
openssl rand -base64 32
# Copy output to JWT_SECRET in apps/api/.env
```

#### Hot Reload Not Working

**Problem**: Changes to code files don't trigger reload

**Solutions**:

1. **For API (Fastify)**:
   - Verify tsx watch mode is running (check terminal output)
   - Check file is in watched directory (`apps/api/src/`)
   - Restart dev server: `Ctrl+C` then `pnpm dev:api`

2. **For Web (Next.js)**:
   - Verify Fast Refresh is enabled (should be by default)
   - Check browser console for errors
   - Try hard refresh: `Ctrl+Shift+R` or `Cmd+Shift+R`
   - Restart dev server: `Ctrl+C` then `pnpm dev:web`

#### Build or Cache Issues

**Problem**: Build fails or shows stale cached results

**Solutions**:

1. **Clear Turbo cache**:

```bash
pnpm clean:cache
```

2. **Full clean and reinstall**:

```bash
pnpm clean
pnpm install
```

3. **Clear Next.js cache** (if web build issues):

```bash
rm -rf apps/web/.next
```

4. **Clear API build output** (if API build issues):

```bash
rm -rf apps/api/dist
```

#### Git Hook Permission Issues

**Problem**: Git hooks not executing or showing permission errors

**Solutions**:

1. **Make pre-commit hook executable**:

```bash
chmod +x .husky/pre-commit
```

2. **Verify git hooks path**:

```bash
git config core.hooksPath
# Should output: .husky
```

3. **Re-run setup**:

```bash
pnpm prepare
```

4. **Test hooks manually**:

```bash
./scripts/test-git-hooks.sh
```

#### TypeScript Errors After Install

**Problem**: TypeScript shows errors for imports from `@journiful/shared`

**Solutions**:

1. **Rebuild shared package**:

```bash
cd shared
pnpm build
cd ..
```

2. **Restart TypeScript server** (in your editor):
   - VS Code: `Cmd+Shift+P` → "TypeScript: Restart TS Server"
   - WebStorm: File → Invalidate Caches → Restart

3. **Verify workspace resolution**:

```bash
pnpm why @journiful/shared
```

#### Docker Container Won't Start

**Problem**: `pnpm docker:up` fails or container exits immediately

**Solutions**:

1. **Check Docker daemon is running**:

```bash
docker info
```

2. **Check for port conflicts**:

```bash
lsof -ti:5433
# If output exists, kill the process
```

3. **View container logs**:

```bash
docker compose logs postgres
```

4. **Remove and recreate**:

```bash
pnpm docker:down
docker volume rm journiful_postgres_data  # Warning: deletes data
pnpm docker:up
```

5. **Check Docker Compose file syntax**:

```bash
docker compose config
```

### Getting Help

If you continue to experience issues:

1. Check the detailed development guide: [DEVELOPMENT.md](DEVELOPMENT.md)
2. Review Git hooks documentation: [docs/GIT_HOOKS.md](docs/GIT_HOOKS.md)
3. Check scripts documentation: [scripts/README.md](scripts/README.md)
4. Run comprehensive verification: `./scripts/verify-dev-setup.sh`
5. Check recent git commits for implementation examples

## Quick Reference

### Common Commands Cheatsheet

```bash
# First time setup
pnpm install                    # Install dependencies
pnpm docker:up                  # Start database
pnpm dev                        # Start dev servers

# Daily development
pnpm dev                        # Start all servers
pnpm dev:web                    # Start only frontend
pnpm dev:api                    # Start only backend

# Code quality
pnpm lint                       # Check linting
pnpm lint:fix                   # Fix linting issues
pnpm format                     # Format code
pnpm typecheck                  # Check types
pnpm test                       # Run tests

# Database
cd apps/api                     # Navigate to API
pnpm db:generate                # Create migration
pnpm db:migrate                 # Run migration
pnpm db:studio                  # Open DB browser

# Docker
pnpm docker:up                  # Start PostgreSQL
pnpm docker:down                # Stop PostgreSQL
pnpm docker:logs                # View logs

# Building
pnpm build                      # Build all apps
pnpm build:web                  # Build frontend
pnpm build:api                  # Build backend

# Cleanup
pnpm clean:cache                # Clear Turbo cache
pnpm clean                      # Full clean
```

### Port Assignments

| Service               | Port | URL                                    |
| --------------------- | ---- | -------------------------------------- |
| Web Frontend          | 3000 | http://localhost:3000                  |
| API Backend           | 8000 | http://localhost:8000                  |
| API Health            | 8000 | http://localhost:8000/api/health       |
| API Liveness Probe    | 8000 | http://localhost:8000/api/health/live  |
| API Readiness Probe   | 8000 | http://localhost:8000/api/health/ready |
| PostgreSQL (external) | 5433 | localhost:5433                         |
| PostgreSQL (internal) | 5432 | Container only                         |

### Technology Stack

| Layer              | Technology              | Version      |
| ------------------ | ----------------------- | ------------ |
| Monorepo           | pnpm workspaces + Turbo | 10.x + 2.3.3 |
| Frontend Framework | Next.js                 | 16.x         |
| Frontend UI        | React                   | 19.x         |
| Styling            | Tailwind CSS            | 4.x          |
| UI Components      | shadcn/ui               | Latest       |
| Backend Framework  | Fastify                 | 5.x          |
| Database           | PostgreSQL              | 16           |
| ORM                | Drizzle                 | Latest       |
| Runtime            | Node.js                 | 22.x         |
| Validation         | Zod                     | 3.x          |
| Testing            | Vitest                  | 3.x          |
| Linting            | ESLint                  | 9.x          |
| Formatting         | Prettier                | 3.x          |
| Git Hooks          | Husky + lint-staged     | 9.x + 15.x   |

### Architecture Links

- **Development Guide**: [DEVELOPMENT.md](DEVELOPMENT.md) - Complete development setup and workflow
- **Git Hooks**: [docs/GIT_HOOKS.md](docs/GIT_HOOKS.md) - Pre-commit hooks, Husky, lint-staged, Prettier
- **Scripts Documentation**: [scripts/README.md](scripts/README.md) - All test and verification scripts
- **Workflow Test**: [scripts/WORKFLOW-TEST.md](scripts/WORKFLOW-TEST.md) - End-to-end workflow documentation

## Additional Documentation

- [DEVELOPMENT.md](DEVELOPMENT.md) - Detailed development setup and workflow guide
- [docs/GIT_HOOKS.md](docs/GIT_HOOKS.md) - Git hooks configuration and usage
- [scripts/README.md](scripts/README.md) - Documentation for all test scripts
- [apps/api/.env.example](apps/api/.env.example) - Backend environment variables template
- [apps/web/.env.local.example](apps/web/.env.local.example) - Frontend environment variables template

## Support

For issues or questions:

1. Review the troubleshooting section above
2. Check the detailed documentation in `/docs`
3. Run verification scripts in `/scripts`
4. Review git history for implementation examples
5. Check individual package READMEs in `apps/` and `shared/`

## License

[License information to be added]

## Contributing

[Contributing guidelines to be added]
