#!/bin/bash
#
# Install git hooks for sandctl development
#
# This script configures git to use the hooks in .githooks/
# Run this once after cloning the repository.
#

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m' # No Color

# Check we're in the repository root
if [ ! -d ".git" ]; then
    echo -e "${RED}Error:${NC} Run this script from the repository root"
    echo "Usage: ./scripts/install-hooks.sh"
    exit 1
fi

# Check that .githooks directory exists
if [ ! -d ".githooks" ]; then
    echo -e "${RED}Error:${NC} .githooks directory not found"
    exit 1
fi

# Configure git to use our hooks directory
git config core.hooksPath .githooks

echo -e "${GREEN}✓${NC} Git hooks installed successfully!"
echo ""
echo "The pre-commit hook will now run automatically before each commit."
echo "It checks for:"
echo "  - Code formatting (gofmt)"
echo "  - Static analysis (go vet)"
echo "  - Linting issues (golangci-lint)"
echo ""
echo "To bypass the hook in emergencies: git commit --no-verify"
