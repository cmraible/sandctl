# sandctl Development Guidelines

Auto-generated from all feature plans. Last updated: 2026-01-22

## Active Technologies
- Go 1.22+ + Cobra (CLI framework), gopkg.in/yaml.v3 (config serialization), golang.org/x/term (secure input) (002-init-command)
- YAML file at `~/.sandctl/config` (002-init-command)
- Go 1.22 + Cobra (CLI), gopkg.in/yaml.v3 (config), golang.org/x/term (003-human-readable-names)
- Local JSON file at `~/.sandctl/sessions.json` (003-human-readable-names)

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
- 003-human-readable-names: Added Go 1.22 + Cobra (CLI), gopkg.in/yaml.v3 (config), golang.org/x/term
- 002-init-command: Added Go 1.22+ + Cobra (CLI framework), gopkg.in/yaml.v3 (config serialization), golang.org/x/term (secure input)

- 001-sandbox-cli: Added Go 1.22+ + Cobra (CLI framework), Viper (config), Fly.io Sprites SDK

<!-- MANUAL ADDITIONS START -->
<!-- MANUAL ADDITIONS END -->
