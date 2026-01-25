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
- 010-rename-start-to-new: Added Go 1.24 + Cobra (CLI framework), gopkg.in/yaml.v3 (config), golang.org/x/term (secure input)
- 008-e2e-test-suite: Added Go 1.23.0 + Cobra (CLI framework), `os/exec` (command execution), `testing` (Go standard test framework)
- 006-opencode-default-agent: Added Go 1.23.0 + Cobra (CLI), gopkg.in/yaml.v3 (config), golang.org/x/term (secure input)


<!-- MANUAL ADDITIONS START -->
<!-- MANUAL ADDITIONS END -->
