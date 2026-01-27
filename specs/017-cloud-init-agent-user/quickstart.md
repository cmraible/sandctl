# Quickstart: Cloud-Init Agent User

**Feature Branch**: `017-cloud-init-agent-user`
**Date**: 2026-01-26

## What Changed

After this feature is implemented:

1. **New VMs use "agent" user** instead of root for SSH connections
2. **Fewer packages installed** - nodejs, npm, python3, pip removed from default installation
3. **Repositories cloned to `/home/agent/<repo-name>`** instead of `/root/<repo-name>`

## Usage Examples

### Creating a new VM

```bash
# Create a VM (same command, but now uses agent user)
sandctl new

# Connect to the VM (automatically uses agent user)
sandctl console
```

### Creating a VM with a repository

```bash
# Clone a repo during VM creation
sandctl new --repo cmraible/my-project

# Repository is cloned to /home/agent/my-project
sandctl console
# agent@vm:~$ ls
# my-project/
```

### Using sudo

```bash
# Agent user has passwordless sudo
sandctl exec "sudo apt-get install nodejs"
```

### Checking the user

```bash
# Verify you're connected as agent user
sandctl exec "whoami"
# Output: agent

sandctl exec "pwd"
# Output: /home/agent
```

## What Tools Are Installed

| Tool | Purpose |
|------|---------|
| docker | Container runtime |
| git | Version control |
| curl | HTTP client |
| wget | File download |
| jq | JSON processor |
| htop | System monitor |
| vim | Text editor |

## What's NOT Installed (Install Manually If Needed)

```bash
# Node.js
sandctl exec "sudo apt-get install -y nodejs npm"

# Python
sandctl exec "sudo apt-get install -y python3 python3-pip"
```

## Migration Notes

- **Existing VMs**: Unaffected. They continue to use root user.
- **New VMs**: Will use agent user automatically.
- **No configuration changes needed**: The default user is changed in the CLI itself.

## Verification Commands

After creating a VM, verify the setup:

```bash
# Check user
sandctl exec "whoami"  # Should output: agent

# Check home directory
sandctl exec "pwd"  # Should output: /home/agent

# Check sudo access
sandctl exec "sudo id"  # Should work without password prompt

# Check docker access
sandctl exec "docker ps"  # Should work without sudo

# Check installed tools
sandctl exec "which git curl wget jq htop vim"
```
