export function generatePostSnapshotSSHSetup(): string {
	return [
		"mkdir -p /home/agent/.ssh",
		"cp /root/.ssh/authorized_keys /home/agent/.ssh/authorized_keys",
		"chown -R agent:agent /home/agent/.ssh",
		"chmod 700 /home/agent/.ssh",
		"chmod 600 /home/agent/.ssh/authorized_keys",
	].join(" && ");
}

const AGENT_ZSHRC_CONTENT = `export PATH="$HOME/.local/bin:$PATH"
eval "$(starship init zsh)"`;
const AGENT_ZSHRC_BASE64 = Buffer.from(
	`${AGENT_ZSHRC_CONTENT}\n`,
	"utf8",
).toString("base64");

export function generateCloudInit(): string {
	return `#cloud-config
packages:
  - zsh
  - npm

users:
  - name: agent
    shell: /usr/bin/zsh
    groups:
      - sudo
      - docker
    sudo: "ALL=(ALL) NOPASSWD:ALL"
    ssh_authorized_keys: []
runcmd:
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
  - |
    curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg
    chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | tee /etc/apt/sources.list.d/github-cli.list > /dev/null
    apt-get update
    apt-get install -y gh
  - su - agent -c 'curl -fsSL https://claude.ai/install.sh | bash'
  - npm install -g @openai/codex
  - curl -fsSL https://starship.rs/install.sh | sh -s -- -y
  - |
    echo '${AGENT_ZSHRC_BASE64}' | base64 -d > /home/agent/.zshrc
    chown agent:agent /home/agent/.zshrc
    chmod 644 /home/agent/.zshrc
`;
}

export function detectContentType(content: string): string {
	const firstLine = content.trimStart().split("\n")[0];
	if (firstLine === "#cloud-config") {
		return "text/cloud-config";
	}
	return "text/x-shellscript";
}

const MERGE_HOW_DIRECTIVE = `merge_how:
  - name: list
    settings: [append]
  - name: dict
    settings: [no_replace, recurse_list]`;

function ensureMergeDirective(content: string): string {
	if (detectContentType(content) !== "text/cloud-config") {
		return content;
	}
	if (content.includes("merge_how")) {
		return content;
	}
	return content.replace(
		/^#cloud-config\n/,
		`#cloud-config\n${MERGE_HOW_DIRECTIVE}\n`,
	);
}

export function assembleUserData(
	globalBase: string,
	layers: string[] = [],
): string {
	if (layers.length === 0) {
		return globalBase;
	}

	const boundary = "==SANDCTL==";
	const processedLayers = layers.map(ensureMergeDirective);
	const allLayers = [globalBase, ...processedLayers];

	const parts = allLayers.map((content) => {
		const contentType = detectContentType(content);
		const normalized = content.endsWith("\n") ? content : `${content}\n`;
		return `--${boundary}\nContent-Type: ${contentType}\n\n${normalized}`;
	});

	return [
		`Content-Type: multipart/mixed; boundary="${boundary}"`,
		"MIME-Version: 1.0",
		"",
		...parts,
		`--${boundary}--`,
		"",
	].join("\n");
}
