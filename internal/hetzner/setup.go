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

# Update package lists
apt-get update

# Install Docker
apt-get install -y docker.io
systemctl enable docker
systemctl start docker
usermod -aG docker root

# Install development tools
apt-get install -y git nodejs npm python3 python3-pip

# Install common development utilities
apt-get install -y curl wget jq htop vim

# Clean up
apt-get autoremove -y
apt-get clean

# Signal completion
touch /var/lib/cloud/instance/boot-finished
echo "sandctl setup complete" >> /var/log/cloud-init-output.log
`
}

// CloudInitScriptWithRepo returns a cloud-init script that also clones a repository.
func CloudInitScriptWithRepo(repoURL, targetPath string) string {
	base := CloudInitScript()
	return base + `
# Clone repository
git clone ` + repoURL + ` ` + targetPath + ` || echo "Failed to clone repository"
`
}
