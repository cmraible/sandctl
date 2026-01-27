# Research: Cloud-Init Agent User

**Feature Branch**: `017-cloud-init-agent-user`
**Date**: 2026-01-26

## Research Tasks

### 1. Cloud-Init User Creation Best Practices

**Decision**: Use `useradd` with explicit options for creating the agent user.

**Rationale**:
- `useradd` is the low-level tool that works consistently across Ubuntu/Debian
- We need explicit control over home directory creation and shell assignment
- The `-m` flag creates the home directory, `-s` sets the shell

**Implementation**:
```bash
useradd -m -s /bin/bash agent
```

**Alternatives Considered**:
- `adduser`: More interactive, designed for human use. Rejected because cloud-init runs non-interactively.
- cloud-init's native `users:` directive: Would require switching from user-data scripts to cloud-config YAML format. Rejected to minimize changes and maintain control.

### 2. SSH Authorized Keys Propagation

**Decision**: Copy root's authorized_keys to the agent user's .ssh directory after user creation.

**Rationale**:
- Hetzner injects SSH keys into root's `~/.ssh/authorized_keys` during VM provisioning
- The agent user needs these same keys to allow SSH access
- Must set correct permissions (700 for .ssh, 600 for authorized_keys, owned by agent:agent)

**Implementation**:
```bash
mkdir -p /home/agent/.ssh
cp /root/.ssh/authorized_keys /home/agent/.ssh/authorized_keys
chown -R agent:agent /home/agent/.ssh
chmod 700 /home/agent/.ssh
chmod 600 /home/agent/.ssh/authorized_keys
```

**Alternatives Considered**:
- Using `AuthorizedKeysCommand` in sshd_config: Too complex, requires configuration file modification. Rejected.
- Symlink to root's keys: Would break if root's keys are modified. Rejected.

### 3. Sudoers Configuration for Passwordless Sudo

**Decision**: Add agent user to sudoers with NOPASSWD for all commands.

**Rationale**:
- Development/agent VMs need frictionless sudo access (per spec assumptions)
- Using `/etc/sudoers.d/agent` file is cleaner than modifying `/etc/sudoers`
- File permissions must be 0440 (read-only for root and sudoers group)

**Implementation**:
```bash
echo "agent ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/agent
chmod 0440 /etc/sudoers.d/agent
```

**Alternatives Considered**:
- Adding agent to sudo group: Requires password. Rejected per FR-003.
- Modifying /etc/sudoers directly: Risk of syntax errors breaking sudo. Using sudoers.d is safer.

### 4. Docker Group Membership

**Decision**: Add agent user to docker group in addition to root.

**Rationale**:
- Current script adds root to docker group (`usermod -aG docker root`)
- Agent user needs docker access for development workflows
- Must add agent to docker group to run docker commands without sudo

**Implementation**:
```bash
usermod -aG docker agent
```

**Alternatives Considered**:
- Running docker only via sudo: Adds friction, not standard practice. Rejected.

### 5. Repository Cloning with Proper Ownership

**Decision**: Clone as root, then chown to agent:agent.

**Rationale**:
- Cloud-init runs as root; cannot easily switch users mid-script
- Using `su - agent -c "git clone ..."` has shell escaping issues and may fail with SSH URLs
- Cloning as root then changing ownership is simpler and reliable for HTTPS URLs

**Implementation**:
```bash
git clone <url> /home/agent/<repo> || echo "Failed to clone repository"
chown -R agent:agent /home/agent/<repo>
```

**Alternatives Considered**:
- Running git clone as agent user: Complex due to environment/PATH issues in cloud-init. Rejected.
- Using sudo -u agent: Similar issues with environment. Rejected.

### 6. Package Installation Optimization

**Decision**: Remove nodejs, npm, python3, python3-pip from default installation.

**Rationale**:
- These packages are rarely needed for agent workflows
- Reduces installation time (nodejs/npm are particularly slow to install)
- Users can install them manually when needed

**Current packages (to remove)**:
- nodejs (~50MB, slow apt dependency resolution)
- npm (pulls in nodejs if not present)
- python3 (already present in Ubuntu 24.04 base image)
- python3-pip

**Packages to keep**:
- docker.io (core functionality)
- git (version control)
- curl, wget (HTTP clients)
- jq (JSON processing)
- htop (system monitoring)
- vim (text editing)

### 7. Cloud-Init Script Ordering

**Decision**: Order operations to ensure dependencies are met.

**Required order**:
1. Update apt package lists
2. Install Docker
3. Install tools (git, curl, wget, jq, htop, vim)
4. Create agent user
5. Add agent to docker group
6. Setup SSH keys for agent
7. Setup passwordless sudo
8. Clone repository (if requested) and set ownership
9. Cleanup and signal completion

**Rationale**: User must exist before group membership and SSH key setup. Docker must be installed before adding users to docker group.

## Summary

All research questions have been resolved. The implementation approach is straightforward:
- Minimal code changes (3 files)
- Cloud-init script extended with user creation and configuration
- Single constant change for SSH user default
- Single constant change for repository target path
