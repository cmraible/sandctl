# sandctl Development Guidelines

Auto-generated from all feature plans. Last updated: 2026-01-22

## Active Technologies
- Go 1.22+ + Cobra (CLI framework), gopkg.in/yaml.v3 (config serialization), golang.org/x/term (secure input) (002-init-command)
- YAML file at `~/.sandctl/config` (002-init-command)
- Go 1.22 + Cobra (CLI), gopkg.in/yaml.v3 (config), golang.org/x/term (003-human-readable-names)
- Local JSON file at `~/.sandctl/sessions.json` (003-human-readable-names)
- Go 1.22+ (existing project), YAML (GitHub Actions workflows) + GitHub Actions (ubuntu-latest runner), Go toolchain (004-github-actions-ci)
- N/A (CI/CD configuration only) (004-github-actions-ci)
- Go 1.23.0 + Cobra (CLI), gopkg.in/yaml.v3 (config), golang.org/x/term (secure input) (006-opencode-default-agent)
- YAML file at `~/.sandctl/config` (0600 permissions), JSON at `~/.sandctl/sessions.json` (006-opencode-default-agent)
- Go 1.23.0 + Cobra (CLI framework), `os/exec` (command execution), `testing` (Go standard test framework) (008-e2e-test-suite)
- N/A (test artifacts use temp directories) (008-e2e-test-suite)
- Go 1.24 + Cobra (CLI framework), gopkg.in/yaml.v3 (config), golang.org/x/term (secure input) (010-rename-start-to-new)
- Go 1.24 + github.com/spf13/cobra v1.9.1 (CLI), github.com/gorilla/websocket v1.5.1 (WebSocket), golang.org/x/term v0.30.0 (terminal control) (011-console-command)
- ~/.sandctl/sessions.json (local session store), ~/.sandctl/config (YAML config) (011-console-command)
- Go 1.24 + github.com/spf13/cobra v1.9.1 (CLI), golang.org/x/term v0.30.0 (terminal detection) (012-auto-console-after-new)
- Go 1.24 + github.com/spf13/cobra v1.9.1 (CLI), golang.org/x/term v0.30.0 (terminal) (013-repo-clone)
- Go 1.24.0 + github.com/spf13/cobra v1.9.1 (CLI), golang.org/x/crypto/ssh (SSH client/agent), gopkg.in/yaml.v3 (config), golang.org/x/term (terminal detection) (016-ssh-agent-support)
- Go 1.24.0 + github.com/spf13/cobra v1.9.1 (CLI), golang.org/x/crypto/ssh (SSH client), gopkg.in/yaml.v3 (config) (017-cloud-init-agent-user)
- Go 1.24.0 + github.com/spf13/cobra v1.9.1 (CLI), gopkg.in/yaml.v3 (config), golang.org/x/term (terminal detection) (018-rename-repo-to-template)
- YAML files at `~/.sandctl/templates/<name>/config.yaml`, shell scripts at `~/.sandctl/templates/<name>/init.sh` (018-rename-repo-to-template)
- Go 1.24 + github.com/spf13/cobra v1.9.1 (CLI), golang.org/x/crypto/ssh (SSH client), gopkg.in/yaml.v3 (config), golang.org/x/term (terminal detection) (019-gitconfig-setup)
- YAML config file at ~/.sandctl/config, JSON sessions file at ~/.sandctl/sessions.json (019-gitconfig-setup)

- Go 1.22+ + Cobra (CLI framework), Viper (config), Fly.io Sprites SDK (001-sandbox-cli)

## Project Structure

```text
src/
tests/
```

## Commands

# Add commands for Go 1.22+

## Code Style

Go 1.22+: Follow standard conventions

## Recent Changes
- 019-gitconfig-setup: Added Go 1.24 + github.com/spf13/cobra v1.9.1 (CLI), golang.org/x/crypto/ssh (SSH client), gopkg.in/yaml.v3 (config), golang.org/x/term (terminal detection)
- 018-rename-repo-to-template: Added Go 1.24.0 + github.com/spf13/cobra v1.9.1 (CLI), gopkg.in/yaml.v3 (config), golang.org/x/term (terminal detection)
- 017-cloud-init-agent-user: Added Go 1.24.0 + github.com/spf13/cobra v1.9.1 (CLI), golang.org/x/crypto/ssh (SSH client), gopkg.in/yaml.v3 (config)


<!-- MANUAL ADDITIONS START -->
<!-- MANUAL ADDITIONS END -->
