import YAML from "yaml";

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

interface GenerateCloudInitOptions {
	githubToken?: string;
}

function generateGitHubTokenSetup(githubToken: string): string {
	const tokenBase64 = Buffer.from(`${githubToken}\n`, "utf8").toString(
		"base64",
	);
	const profileBase64 = Buffer.from(
		`if [ -f /home/agent/.config/sandctl/github-token ]; then
  export GH_TOKEN="$(cat /home/agent/.config/sandctl/github-token)"
  export GITHUB_TOKEN="$GH_TOKEN"
fi
`,
		"utf8",
	).toString("base64");
	const ghHostsBase64 = Buffer.from(
		`github.com:
    oauth_token: ${githubToken}
    git_protocol: https
`,
		"utf8",
	).toString("base64");

	return `  - |
    install -d -m 700 /home/agent/.config /home/agent/.config/sandctl /home/agent/.config/gh
    echo '${tokenBase64}' | base64 -d > /home/agent/.config/sandctl/github-token
    echo '${ghHostsBase64}' | base64 -d > /home/agent/.config/gh/hosts.yml
    echo '${profileBase64}' | base64 -d > /etc/profile.d/sandctl-github-token.sh
    chown -R agent:agent /home/agent/.config
    chmod 600 /home/agent/.config/sandctl/github-token
    chmod 600 /home/agent/.config/gh/hosts.yml
    chmod 600 /etc/profile.d/sandctl-github-token.sh
`;
}

export function generateCloudInit(
	options: GenerateCloudInitOptions = {},
): string {
	const githubTokenSetup = options.githubToken
		? generateGitHubTokenSetup(options.githubToken)
		: "";

	return `#cloud-config
packages:
  - docker.io
  - zsh
  - npm

users:
  - name: agent
    shell: /usr/bin/zsh
    groups:
      - sudo
      - docker
    sudo: "ALL=(ALL) NOPASSWD:ALL"
runcmd:
  - |
    echo 'agent ALL=(ALL) NOPASSWD:ALL' > /etc/sudoers.d/99-agent
    chmod 440 /etc/sudoers.d/99-agent
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
${githubTokenSetup}
  - |
    curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg
    chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | tee /etc/apt/sources.list.d/github-cli.list > /dev/null
    attempts=0
    until apt-get update; do
      attempts=$((attempts + 1))
      if [ "$attempts" -ge 3 ]; then
        exit 1
      fi
      sleep 5
    done
    attempts=0
    until apt-get install -y gh; do
      attempts=$((attempts + 1))
      if [ "$attempts" -ge 3 ]; then
        exit 1
      fi
      sleep 5
    done
  - systemctl enable --now docker
  - |
    attempts=0
    until su - agent -c 'curl -fsSL https://claude.ai/install.sh | bash'; do
      attempts=$((attempts + 1))
      if [ "$attempts" -ge 3 ]; then
        exit 1
      fi
      sleep 5
    done
    su - agent -c 'export PATH="$HOME/.local/bin:$PATH"; claude --version'
  - |
    attempts=0
    codex_version="$(npm view @openai/codex version)"
    arch="$(dpkg --print-architecture)"
    case "$arch" in
      amd64)
        codex_platform_package="@openai/codex-linux-x64@npm:@openai/codex@\${codex_version}-linux-x64"
        ;;
      arm64)
        codex_platform_package="@openai/codex-linux-arm64@npm:@openai/codex@\${codex_version}-linux-arm64"
        ;;
      *)
        echo "Unsupported architecture for Codex install: $arch" >&2
        exit 1
        ;;
    esac
    until npm install -g "@openai/codex@\${codex_version}" "$codex_platform_package"; do
      attempts=$((attempts + 1))
      if [ "$attempts" -ge 3 ]; then
        exit 1
      fi
      sleep 5
    done
    su - agent -c 'export PATH="$HOME/.local/bin:$PATH"; codex --version'
  - |
    attempts=0
    until curl -fsSL https://starship.rs/install.sh | sh -s -- -y; do
      attempts=$((attempts + 1))
      if [ "$attempts" -ge 3 ]; then
        exit 1
      fi
      sleep 5
    done
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

const MERGE_HOW_VALUE = [
	{ name: "list", settings: ["append"] },
	{ name: "dict", settings: ["no_replace", "recurse_list"] },
];

export interface UserDataLayer {
	name: string;
	content: string;
}

function bannerLabel(name: string): string {
	return name.trim().replace(/\s+/g, " ").toUpperCase();
}

function bannerText(name: string, phase: "BEGIN" | "END"): string {
	return `========== SANDCTL ${phase} ${bannerLabel(name)} ==========`;
}

function annotateShellScriptLayer(content: string, name: string): string {
	const normalized = content.endsWith("\n") ? content : `${content}\n`;
	const lines = normalized.split("\n");
	const hasShebang = lines[0]?.startsWith("#!");
	const shebang = hasShebang ? lines[0] : "";
	const body = hasShebang ? lines.slice(1).join("\n") : normalized;
	const begin = `echo '${bannerText(name, "BEGIN")}'`;
	const trap = `trap 'status=$?; echo "${bannerText(name, "END")} (exit \${status})"' EXIT`;

	return [...(shebang ? [shebang] : []), begin, trap, body.trimStart()]
		.filter((line) => line.length > 0)
		.join("\n")
		.concat("\n");
}

function annotateCloudConfigLayer(
	content: string,
	name: string,
	options: { injectMergeHow: boolean },
): string {
	const parsed = YAML.parse(content);
	if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
		return content;
	}

	const doc = parsed as Record<string, unknown>;
	if (options.injectMergeHow && !("merge_how" in doc)) {
		doc.merge_how = MERGE_HOW_VALUE;
	}

	const existingRuncmd = Array.isArray(doc.runcmd) ? [...doc.runcmd] : [];
	doc.runcmd = [
		`echo '${bannerText(name, "BEGIN")}'`,
		...existingRuncmd,
		`echo '${bannerText(name, "END")}'`,
	];

	return `#cloud-config\n${YAML.stringify(doc)}`;
}

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

function annotateLayer(
	name: string,
	content: string,
	options: { injectMergeHow: boolean },
): string {
	if (detectContentType(content) === "text/cloud-config") {
		return annotateCloudConfigLayer(content, name, options);
	}
	return annotateShellScriptLayer(content, name);
}

export function assembleUserData(
	globalBase: string,
	layers: Array<string | UserDataLayer> = [],
): string {
	const annotatedGlobalBase = annotateLayer("global cloud-init", globalBase, {
		injectMergeHow: false,
	});

	if (layers.length === 0) {
		return annotatedGlobalBase;
	}

	const boundary = "==SANDCTL==";
	const processedLayers = layers.map((layer, index) => {
		if (typeof layer === "string") {
			return annotateLayer(`layer ${index + 1}`, ensureMergeDirective(layer), {
				injectMergeHow: true,
			});
		}
		return annotateLayer(layer.name, ensureMergeDirective(layer.content), {
			injectMergeHow: true,
		});
	});
	const allLayers = [annotatedGlobalBase, ...processedLayers];

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
