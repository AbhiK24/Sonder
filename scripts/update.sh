#!/bin/bash
# =============================================================================
# Sonder Auto-Update Script
# =============================================================================
# Updates Sonder to the latest version from GitHub
#
# Usage:
#   ./scripts/update.sh           # Update and restart
#   ./scripts/update.sh --check   # Check for updates only
#   ./scripts/update.sh --force   # Force update even if up-to-date
#
# =============================================================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$ROOT_DIR"

echo -e "${BLUE}🔄 Sonder Update${NC}"
echo ""

# Check if git repo
if [ ! -d ".git" ]; then
    echo -e "${RED}Error: Not a git repository${NC}"
    echo "Please clone Sonder from GitHub to enable updates."
    exit 1
fi

# Get current and remote versions
CURRENT_COMMIT=$(git rev-parse HEAD)
git fetch origin main --quiet

REMOTE_COMMIT=$(git rev-parse origin/main)
COMMITS_BEHIND=$(git rev-list HEAD..origin/main --count)

# Check only mode
if [ "$1" == "--check" ]; then
    if [ "$COMMITS_BEHIND" -eq 0 ]; then
        echo -e "${GREEN}✓ You're up to date!${NC}"
        exit 0
    else
        echo -e "${YELLOW}⚠ $COMMITS_BEHIND new commit(s) available${NC}"
        echo ""
        echo "Recent changes:"
        git log HEAD..origin/main --oneline | head -5
        echo ""
        echo "Run './scripts/update.sh' to update."
        exit 0
    fi
fi

# Check if update needed
if [ "$COMMITS_BEHIND" -eq 0 ] && [ "$1" != "--force" ]; then
    echo -e "${GREEN}✓ Already up to date!${NC}"
    exit 0
fi

echo -e "${YELLOW}📦 $COMMITS_BEHIND new commit(s) available${NC}"
echo ""
echo "Changes:"
git log HEAD..origin/main --oneline | head -10
echo ""

# Check for local changes
if [ -n "$(git status --porcelain)" ]; then
    echo -e "${YELLOW}⚠ You have local changes:${NC}"
    git status --short
    echo ""
    read -p "Stash changes and continue? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        git stash push -m "Auto-stash before update $(date)"
        echo -e "${GREEN}✓ Changes stashed${NC}"
    else
        echo -e "${RED}Update cancelled${NC}"
        exit 1
    fi
fi

# Stop running services
echo ""
echo -e "${BLUE}Stopping services...${NC}"
if command -v pm2 &> /dev/null; then
    pm2 stop all 2>/dev/null || true
fi

# Pull updates
echo -e "${BLUE}Pulling updates...${NC}"
git pull origin main

# Install dependencies
echo -e "${BLUE}Installing dependencies...${NC}"
if command -v pnpm &> /dev/null; then
    pnpm install
else
    npm install
fi

# Build
echo -e "${BLUE}Building...${NC}"
if command -v pnpm &> /dev/null; then
    pnpm build
else
    npm run build
fi

# Restart services
echo -e "${BLUE}Restarting services...${NC}"
if command -v pm2 &> /dev/null; then
    pm2 restart all 2>/dev/null || pm2 start ecosystem.config.cjs
fi

echo ""
echo -e "${GREEN}✓ Update complete!${NC}"
echo ""
echo "New version: $(git rev-parse --short HEAD)"
echo "Run 'pm2 logs' to view service logs."
