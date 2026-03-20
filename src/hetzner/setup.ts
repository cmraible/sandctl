export function generatePostSnapshotSSHSetup(): string {
	return [
		"mkdir -p /home/agent/.ssh",
		"cp /root/.ssh/authorized_keys /home/agent/.ssh/authorized_keys",
		"chown -R agent:agent /home/agent/.ssh",
		"chmod 700 /home/agent/.ssh",
		"chmod 600 /home/agent/.ssh/authorized_keys",
	].join(" && ");
}

export const DEFAULT_REGION = "ash";
export const DEFAULT_SERVER_TYPE = "cpx31";
export const DEFAULT_IMAGE = "ubuntu-24.04";

export function generateCloudInit(): string {
	return `#cloud-config
package_update: true
package_upgrade: true
packages:
  - build-essential
  - ca-certificates
  - curl
  - git
  - wget
  - jq
  - htop
  - mosh
  - tmux
  - vim
  - zsh

users:
  - name: agent
    shell: /bin/zsh
    groups:
      - docker
      - sudo
    sudo: "ALL=(ALL) NOPASSWD:ALL"
    ssh_authorized_keys: []

runcmd:
  # Copy root's SSH authorized_keys to agent user (Hetzner injects keys for root)
  - |
    mkdir -p /home/agent/.ssh
    if [ -f /root/.ssh/authorized_keys ]; then
      cp /root/.ssh/authorized_keys /home/agent/.ssh/authorized_keys
    else
      touch /home/agent/.ssh/authorized_keys
    fi
    chown -R agent:agent /home/agent/.ssh
    chmod 700 /home/agent/.ssh
    chmod 600 /home/agent/.ssh/authorized_keys

  # Install Docker Engine
  - install -m 0755 -d /etc/apt/keyrings
  - curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  - chmod a+r /etc/apt/keyrings/docker.asc
  - |
    . /etc/os-release
    echo "Types: deb
    URIs: https://download.docker.com/linux/ubuntu
    Suites: \${UBUNTU_CODENAME:-$VERSION_CODENAME}
    Components: stable
    Signed-By: /etc/apt/keyrings/docker.asc" > /etc/apt/sources.list.d/docker.sources
  - apt-get update
  - apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

  # Install GitHub CLI
  - curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg -o /usr/share/keyrings/githubcli-archive-keyring.gpg
  - chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg
  - echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" > /etc/apt/sources.list.d/github-cli.list
  - apt-get update
  - apt-get install -y gh

  # Install Node.js
  - curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  - apt-get install -y nodejs

  # Install Claude Code (as agent user so it's available in their PATH)
  - su - agent -c "curl -fsSL https://claude.ai/install.sh | bash"

  # Clean up
  - apt-get autoremove -y
  - apt-get clean
`;
}
