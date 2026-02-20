# =============================================================================
# Sonder - Multi-stage Dockerfile
# =============================================================================
# Builds a production-ready image for running Sonder bots and dashboard
#
# Usage:
#   docker build -t sonder .
#   docker run -d --env-file .env -v sonder-data:/home/node/.sonder sonder
#
# =============================================================================

# -----------------------------------------------------------------------------
# Stage 1: Base with pnpm
# -----------------------------------------------------------------------------
FROM node:20-alpine AS base

# Install pnpm
RUN corepack enable && corepack prepare pnpm@8.14.0 --activate

# Set working directory
WORKDIR /app

# -----------------------------------------------------------------------------
# Stage 2: Install dependencies
# -----------------------------------------------------------------------------
FROM base AS deps

# Copy package files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/engine/package.json ./packages/engine/
COPY packages/dashboard/package.json ./packages/dashboard/

# Install all dependencies
RUN pnpm install --frozen-lockfile

# -----------------------------------------------------------------------------
# Stage 3: Build
# -----------------------------------------------------------------------------
FROM base AS builder

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/engine/node_modules ./packages/engine/node_modules
COPY --from=deps /app/packages/dashboard/node_modules ./packages/dashboard/node_modules

# Copy source files
COPY . .

# Skip build - we use tsx at runtime which handles TypeScript directly
# RUN pnpm build

# -----------------------------------------------------------------------------
# Stage 4: Production
# -----------------------------------------------------------------------------
FROM node:20-alpine AS production

# Install pnpm, PM2, and tsx for runtime TypeScript execution
RUN corepack enable && corepack prepare pnpm@8.14.0 --activate
RUN npm install -g pm2 tsx

# Create non-root user
RUN addgroup -g 1001 -S sonder && \
    adduser -S sonder -u 1001 -G sonder

WORKDIR /app

# Copy built files and dependencies
COPY --from=builder --chown=sonder:sonder /app/package.json ./
COPY --from=builder --chown=sonder:sonder /app/pnpm-workspace.yaml ./
COPY --from=builder --chown=sonder:sonder /app/node_modules ./node_modules
COPY --from=builder --chown=sonder:sonder /app/packages ./packages

# Copy PM2 ecosystem config
COPY --chown=sonder:sonder ecosystem.config.cjs ./

# Create data directory
RUN mkdir -p /home/sonder/.sonder/saves && \
    chown -R sonder:sonder /home/sonder/.sonder

# Set environment
ENV NODE_ENV=production
ENV HOME=/home/sonder
ENV SAVE_PATH=/home/sonder/.sonder/saves
ENV SONDER_CONFIG_DIR=/home/sonder/.sonder

# Switch to non-root user
USER sonder

# Expose dashboard port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

# Start with PM2
CMD ["pm2-runtime", "ecosystem.config.cjs"]
