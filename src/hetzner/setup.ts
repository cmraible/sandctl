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
users:
  - name: agent
    shell: /bin/bash
    groups:
      - sudo
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
`;
}

export function detectContentType(content: string): string {
	const firstLine = content.trimStart().split("\n")[0];
	if (firstLine === "#cloud-config") {
		return "text/cloud-config";
	}
	return "text/x-shellscript";
}

export function assembleUserData(
	globalBase: string,
	layers: string[] = [],
): string {
	if (layers.length === 0) {
		return globalBase;
	}

	const boundary = "==SANDCTL==";
	const allLayers = [globalBase, ...layers];

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
