# Quickstart: Template Commands

**Feature Branch**: `018-rename-repo-to-template`
**Date**: 2026-01-27

## Overview

Templates allow you to define reusable initialization scripts for sandctl sessions. Each template contains an `init.sh` script that runs when you create a new session with that template.

## Quick Reference

```bash
# Create a new template
sandctl template add Ghost

# List all templates
sandctl template list

# View a template's init script
sandctl template show Ghost

# Edit a template's init script
sandctl template edit Ghost

# Delete a template (requires confirmation)
sandctl template remove Ghost

# Use a template with sandctl new
sandctl new --template Ghost
sandctl new -T Ghost  # short flag
```

## Creating Your First Template

### 1. Create the template

```bash
sandctl template add my-dev-env
```

This creates a template directory at `~/.sandctl/templates/my-dev-env/` and opens your default editor to write the initialization script.

### 2. Write your init script

The init script runs on the sandbox VM after creation. Example:

```bash
#!/bin/bash
# Install development tools
apt-get update && apt-get install -y nodejs npm git

# Clone your project
git clone https://github.com/myuser/myproject.git /home/agent/project

# Install dependencies
cd /home/agent/project && npm install

echo "Development environment ready!"
```

### 3. Use the template

```bash
sandctl new --template my-dev-env
```

## Template Naming

Template names are case-insensitive and normalized for storage:

| You Type | Stored As | Both Work |
|----------|-----------|-----------|
| `Ghost` | `ghost` | `sandctl template show Ghost` or `ghost` |
| `My API` | `my-api` | `sandctl template show "My API"` or `my-api` |
| `React/Vue` | `react-vue` | `sandctl template show React/Vue` or `react-vue` |

## Environment Variables

Your init script has access to these environment variables:

| Variable | Description | Example |
|----------|-------------|---------|
| `SANDCTL_TEMPLATE_NAME` | Original template name | `Ghost` |
| `SANDCTL_TEMPLATE_NORMALIZED` | Normalized name | `ghost` |

## Common Patterns

### Clone and setup a repository

```bash
#!/bin/bash
git clone https://github.com/TryGhost/Ghost.git /home/agent/ghost
cd /home/agent/ghost
npm install
npm run build
```

### Multi-language development environment

```bash
#!/bin/bash
# Node.js
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

# Python
apt-get install -y python3 python3-pip python3-venv

# Go
wget https://go.dev/dl/go1.22.0.linux-amd64.tar.gz
tar -C /usr/local -xzf go1.22.0.linux-amd64.tar.gz
echo 'export PATH=$PATH:/usr/local/go/bin' >> /home/agent/.bashrc
```

### Database setup

```bash
#!/bin/bash
apt-get install -y postgresql postgresql-contrib
service postgresql start
sudo -u postgres createuser --superuser agent
sudo -u postgres createdb myapp
```

## Managing Templates

### List with details

```bash
sandctl template list
# Output:
# NAME            CREATED
# ghost           2026-01-27 10:30:00
# react-fullstack 2026-01-26 15:45:00
# my-api          2026-01-25 09:00:00
```

### View script without editing

```bash
sandctl template show ghost
```

### Delete with confirmation

```bash
sandctl template remove ghost
# Delete template 'ghost'? [y/N] y
# Template 'ghost' deleted.
```

### Force delete (for scripts)

```bash
sandctl template remove ghost --force
```

## Breaking Changes from Repo Commands

If you previously used `sandctl repo` commands, note these changes:

| Old (Removed) | New |
|---------------|-----|
| `sandctl repo add owner/repo` | `sandctl template add <name>` |
| `sandctl new -R owner/repo` | `sandctl new -T <name>` |
| `~/.sandctl/repos/` | `~/.sandctl/templates/` |
| `SANDCTL_REPO_URL` | (removed) |
| `SANDCTL_REPO` | `SANDCTL_TEMPLATE_NAME` |

### Migrating from repos to templates

```bash
# View your old repos
ls ~/.sandctl/repos/

# Create equivalent templates manually
sandctl template add ghost
sandctl template edit ghost
# Copy content from ~/.sandctl/repos/tryghost-ghost/init.sh

# Clean up old repos when done
rm -rf ~/.sandctl/repos/
```

## Troubleshooting

### "Template already exists"

The template name (after normalization) already exists. Use `edit` to modify it:

```bash
sandctl template edit ghost
```

### "Template not found"

Check available templates:

```bash
sandctl template list
```

### "No editor found"

Set your preferred editor:

```bash
export EDITOR=vim  # or nano, code, etc.
sandctl template edit ghost
```

### Init script fails

Check the script syntax locally:

```bash
bash -n ~/.sandctl/templates/ghost/init.sh
```

View script output during session creation—errors will be displayed.
