#!/usr/bin/env bash
set -euo pipefail

# pnpm requires CI=true in non-TTY environments (devcontainer up)
export CI=true

echo "[setup] Configuring Journiful devcontainer..."

# Generate API .env only if it doesn't exist (preserves manual edits)
if [ ! -f apps/api/.env ]; then
  cat > apps/api/.env << 'EOF'
NODE_ENV=development
PORT=8000
HOST=0.0.0.0
DATABASE_URL=postgresql://journiful:journiful_dev@db:5432/journiful
JWT_SECRET=devcontainer-secret-key-minimum-32-characters-long
FRONTEND_URL=http://localhost:3000
LOG_LEVEL=info
STORAGE_PROVIDER=s3
AWS_ENDPOINT_URL=http://minio:9000
AWS_S3_BUCKET_NAME=journiful-uploads
AWS_ACCESS_KEY_ID=minioadmin
AWS_SECRET_ACCESS_KEY=minioadmin
AWS_DEFAULT_REGION=us-east-1
MAX_FILE_SIZE=5242880
ALLOWED_MIME_TYPES=image/jpeg,image/png,image/webp
EOF
  echo "[setup] Created apps/api/.env"
fi

# Generate web .env.local only if it doesn't exist
if [ ! -f apps/web/.env.local ]; then
  cat > apps/web/.env.local << 'EOF'
NEXT_PUBLIC_API_URL=http://localhost:8000/api
API_URL=http://localhost:8000/api
NEXT_PUBLIC_SITE_URL=http://localhost:3000
EOF
  echo "[setup] Created apps/web/.env.local"
fi

# Install dependencies (approve native build scripts non-interactively)
pnpm approve-builds esbuild sharp unrs-resolver 2>&1 || true
pnpm install

# Build shared package (required before API/web can use it)
pnpm --filter @journiful/shared build

# Run database migrations
cd apps/api && pnpm db:migrate

echo "[setup] Done! Ready to develop."
