FROM mcr.microsoft.com/devcontainers/javascript-node:1-22-bookworm

# Enable corepack for pnpm (version from package.json)
RUN corepack enable && corepack prepare pnpm@10.30.1 --activate

# Install turbo and playwright-cli globally (npm avoids pnpm global dir permission issues)
RUN npm install -g turbo @playwright/cli@latest

# Install Playwright system dependencies for all browsers and Chrome (requires root)
RUN npx playwright install-deps chromium firefox webkit \
    && npx playwright install chrome

# Pre-create /workspace as root so the node user can populate it below.
RUN mkdir -p /workspace && chown node:node /workspace

# Install Playwright browsers as node user (cache lands in /home/node)
USER node
RUN npx playwright install chromium firefox webkit

# Pre-create volume mount points with node ownership.
# When Docker mounts an empty named volume onto a pre-existing directory,
# it copies the directory's ownership into the volume.
RUN mkdir -p /workspace/node_modules \
             /workspace/apps/api/node_modules \
             /workspace/shared/node_modules \
             /workspace/.pnpm-store
