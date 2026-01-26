# Quickstart: Repository Initialization Scripts

**Feature**: 014-repo-init-scripts
**Date**: 2026-01-25

## Overview

This feature allows you to configure automatic initialization scripts for GitHub repositories. When you run `sandctl new -R <repo>`, if an init script is configured, it will execute after cloning and before the console session starts.

## Getting Started

### 1. Add a Repository Configuration

```bash
sandctl repo add
# Prompt: Repository (owner/repo or URL): TryGhost/Ghost
# Output: Created init script for TryGhost/Ghost
#         Edit your script at: ~/.sandctl/repos/tryghost-ghost/init.sh
```

Or with flags:
```bash
sandctl repo add -R TryGhost/Ghost
```

### 2. Edit the Init Script

```bash
sandctl repo edit TryGhost/Ghost
# Opens ~/.sandctl/repos/tryghost-ghost/init.sh in your editor
```

Example script for a Node.js project:
```bash
#!/bin/bash
set -e

# Install Node.js dependencies
yarn install

# Install Playwright browsers for testing
npx playwright install

# Set up environment
cp .env.example .env.local

echo "Ghost development environment ready!"
```

### 3. Create a Session with the Repository

```bash
sandctl new -R TryGhost/Ghost
# Output:
# Creating new session...
# ✓ Provisioning VM
# ✓ Installing development tools
# ✓ Cloning repository
# ✓ Running init script       # <-- Your script runs here
# ✓ Installing OpenCode
# ✓ Setting up OpenCode authentication
#
# Session created: mango
# Connecting to console...
```

## Managing Configurations

### List all configured repositories
```bash
sandctl repo list
# REPOSITORY          CREATED              TIMEOUT
# TryGhost/Ghost      2026-01-25 10:30    10m
# facebook/react      2026-01-24 14:22    15m
```

### View an init script
```bash
sandctl repo show TryGhost/Ghost
```

### Remove a configuration
```bash
sandctl repo remove TryGhost/Ghost
# Prompt: Remove configuration for 'TryGhost/Ghost'? [y/N]: y
# Output: Removed configuration for TryGhost/Ghost
```

## Init Script Guidelines

### Best Practices

1. **Always use `set -e`** - Exit on first error to catch problems early
2. **Print progress** - Your output appears in the terminal during provisioning
3. **Keep it idempotent** - Script may run multiple times if user creates multiple sessions
4. **Use absolute paths** - Working directory is `/home/sprite/<repo-name>`

### Example: Python Project
```bash
#!/bin/bash
set -e

echo "Setting up Python environment..."
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

echo "Running database migrations..."
python manage.py migrate

echo "Ready!"
```

### Example: Docker-based Project
```bash
#!/bin/bash
set -e

echo "Installing Docker..."
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker sprite

echo "Starting services..."
docker compose up -d

echo "Waiting for services..."
sleep 10
docker compose ps
```

### Example: Custom Tool Installation
```bash
#!/bin/bash
set -e

# Install specific Node version
curl -fsSL https://fnm.vercel.app/install | bash
source ~/.bashrc
fnm install 20
fnm use 20

# Install project dependencies
npm ci

# Install global tools
npm install -g @angular/cli typescript
```

## Handling Errors

If your init script fails, the session is NOT destroyed. You can debug manually:

```bash
sandctl new -R TryGhost/Ghost
# ✗ Running init script
#
# Init script failed for 'TryGhost/Ghost':
# npm ERR! code ENOENT
# ...
#
# Session 'mango' is available for debugging.
# Use 'sandctl console mango' to connect.

# Connect to debug:
sandctl console mango
```

## Timeout Configuration

Default timeout is 10 minutes. For larger projects, increase it:

```bash
sandctl repo add -R large/monorepo --timeout 30m
```

## Directory Structure

```
~/.sandctl/
├── config                    # Main sandctl config
├── sessions.json             # Session data
└── repos/                    # Repository configurations
    └── tryghost-ghost/
        ├── config.yaml       # Metadata
        └── init.sh           # Your init script
```
