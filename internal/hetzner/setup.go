package hetzner

// Default configuration values for Hetzner Cloud.
const (
	// DefaultRegion is Ashburn, Virginia (US East).
	DefaultRegion = "ash"

	// DefaultServerType is CPX31 (4 vCPU, 8GB RAM, AMD EPYC).
	DefaultServerType = "cpx31"

	// DefaultImage is Ubuntu 24.04 LTS.
	DefaultImage = "ubuntu-24.04"
)

// CloudInitScript returns the cloud-init user-data script for VM setup.
// This script runs during first boot to install Docker and development tools.
func CloudInitScript() string {
	return `#!/bin/bash
set -e

# Update package lists and install prerequisites
apt-get update
apt-get install -y ca-certificates curl git wget jq htop vim

# Add Docker's official GPG key
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc

# Add Docker repository
. /etc/os-release
echo "Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: ${UBUNTU_CODENAME:-$VERSION_CODENAME}
Components: stable
Signed-By: /etc/apt/keyrings/docker.asc" > /etc/apt/sources.list.d/docker.sources

# Install Docker Engine with Compose plugin
apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Create agent user with home directory and bash shell
useradd -m -s /bin/bash agent

# Add agent user to docker group
usermod -aG docker agent

# Setup SSH authorized_keys for agent user
mkdir -p /home/agent/.ssh
cp /root/.ssh/authorized_keys /home/agent/.ssh/authorized_keys
chown -R agent:agent /home/agent/.ssh
chmod 700 /home/agent/.ssh
chmod 600 /home/agent/.ssh/authorized_keys

# Configure passwordless sudo for agent user
echo "agent ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/agent
chmod 0440 /etc/sudoers.d/agent

# Install GitHub CLI from official repository
type -p curl >/dev/null || apt-get install -y curl
curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg
chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | tee /etc/apt/sources.list.d/github-cli.list > /dev/null
apt-get update
apt-get install -y gh

# Clean up
apt-get autoremove -y
apt-get clean

# Signal completion
touch /var/lib/cloud/instance/boot-finished
echo "sandctl setup complete" >> /var/log/cloud-init-output.log
`
}
