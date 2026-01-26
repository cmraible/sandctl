# Research: Repository Initialization Scripts

**Feature**: 014-repo-init-scripts
**Date**: 2026-01-25

## Research Topics

### 1. File Permissions for Init Scripts

**Decision**: Use 0700 for directories, 0755 for init scripts

**Rationale**:
- Directories at 0700 (rwx------) restrict access to owner only, consistent with existing `~/.sandctl/` patterns
- Init scripts at 0755 (rwxr-xr-x) are executable and readable, which is standard for shell scripts
- Differs from config files (0600) because scripts aren't secrets—they're intended to be shared/versioned

**Alternatives Considered**:
- 0700 for scripts: Too restrictive, prevents copying to sprite with correct permissions
- 0600 for scripts: Not executable; would require explicit `bash script.sh` invocation

### 2. External Editor Invocation ($EDITOR)

**Decision**: Check `$VISUAL`, then `$EDITOR`, fallback to `vi`

**Rationale**:
- This is the POSIX-standard order (`$VISUAL` for full-screen, `$EDITOR` for line-based)
- `vi` is universally available on macOS/Linux as the last resort
- User gets feedback: "Opening in {editor}..." before launching

**Implementation Pattern** (from Go stdlib `os/exec`):
```go
func getEditor() string {
    if editor := os.Getenv("VISUAL"); editor != "" {
        return editor
    }
    if editor := os.Getenv("EDITOR"); editor != "" {
        return editor
    }
    return "vi"
}

func openInEditor(path string) error {
    editor := getEditor()
    cmd := exec.Command(editor, path)
    cmd.Stdin = os.Stdin
    cmd.Stdout = os.Stdout
    cmd.Stderr = os.Stderr
    return cmd.Run()
}
```

**Alternatives Considered**:
- Requiring `$EDITOR` to be set: Poor UX, many users don't configure this
- Using `open -e` on macOS: Platform-specific, not portable
- Interactive prompt for editor: Over-engineered for this use case

### 3. Transferring Scripts to Sprite and Executing

**Decision**: Use `cat` with heredoc via `ExecCommand()`, then `bash` to execute

**Rationale**:
- No need for SCP/SFTP—the script content can be echoed directly
- Heredoc with unique delimiter prevents content injection issues
- Execute with explicit `bash` for consistent behavior across shells

**Implementation Pattern**:
```go
func transferAndExecuteScript(client *sprites.Client, spriteName, scriptContent, workDir string, timeout time.Duration) error {
    // Transfer script to temp location
    scriptPath := "/tmp/sandctl-init.sh"

    // Use base64 encoding to safely transfer script content
    encoded := base64.StdEncoding.EncodeToString([]byte(scriptContent))
    transferCmd := fmt.Sprintf("echo '%s' | base64 -d > %s && chmod +x %s",
        encoded, scriptPath, scriptPath)

    if _, err := client.ExecCommand(spriteName, transferCmd); err != nil {
        return fmt.Errorf("failed to transfer init script: %w", err)
    }

    // Execute with timeout, in workdir
    timeoutSecs := int(timeout.Seconds())
    execCmd := fmt.Sprintf("cd %s && timeout %d bash %s 2>&1",
        workDir, timeoutSecs, scriptPath)

    output, err := client.ExecCommand(spriteName, execCmd)
    // ... handle output streaming and errors
}
```

**Alternatives Considered**:
- Writing file via echo with escaping: Fragile with special characters in scripts
- Using `scp` or similar: Requires additional tooling/credentials
- Mounting volume: Over-engineered, requires infrastructure changes

### 4. Repository Name Normalization

**Decision**: Lowercase, replace `/` with `-`, strip `.git` suffix

**Rationale**:
- Case-insensitive matching is required by spec (FR-004)
- `/` cannot be in filesystem paths (except as separator)
- Consistent normalization ensures `TryGhost/Ghost` and `tryghost/ghost` map to same config

**Implementation**:
```go
func NormalizeName(repo string) string {
    name := strings.ToLower(repo)
    name = strings.TrimSuffix(name, ".git")
    name = strings.ReplaceAll(name, "/", "-")
    return name
}

// Examples:
// "TryGhost/Ghost" -> "tryghost-ghost"
// "facebook/react.git" -> "facebook-react"
// "owner/repo" -> "owner-repo"
```

**Alternatives Considered**:
- URL encoding: Results in `%2F` which is ugly and confusing
- Using `_` as separator: `-` is more conventional for slugs
- Preserving case: Breaks case-insensitive matching requirement

### 5. Integration with `new.go` Flow

**Decision**: Add init script execution as a step after `cloneRepository`, before OpenCode install

**Rationale**:
- Script runs AFTER repo is cloned (so it can reference repo files)
- Script runs BEFORE console starts (per spec requirement)
- OpenCode install comes after so users can customize PATH/environment first
- Execution is a separate step in the `ui.ProgressStep` array

**Flow modification**:
```
1. Provisioning VM
2. Installing development tools
3. Cloning repository           (if -R flag)
4. Running init script          (NEW - if config exists for repo)
5. Installing OpenCode
6. Setting up OpenCode auth
7. (console starts or exits)
```

**Error handling**:
- Script failure: Print error + sprite name, exit without console (per spec)
- Sprite NOT destroyed: User can debug via `sandctl console <name>`
- Clear messaging: "Init script failed. Session '%s' is still available for debugging."

### 6. Init Script Template Content

**Decision**: Minimal template with helpful comments

**Template**:
```bash
#!/bin/bash
# Init script for {owner}/{repo}
# This script runs in the sprite after the repository is cloned.
# Working directory: /home/sprite/{repo-name}
#
# Common tasks:
# - Install dependencies: npm install, yarn, pip install -r requirements.txt
# - Install system packages: sudo apt-get install -y <package>
# - Set up environment: export VAR=value
# - Build the project: make, cargo build, etc.
#
# The script output is displayed during 'sandctl new -R {owner}/{repo}'
# Exit code 0 = success, non-zero = failure (console won't start automatically)

set -e  # Exit on first error

# Add your initialization commands below:

```

**Rationale**:
- `#!/bin/bash` shebang for explicit shell
- `set -e` by default to catch errors early
- Comments explain context and common use cases
- Placeholder text invites user to add commands

## Summary

All research topics resolved with clear decisions and implementation patterns. No clarifications needed from user. Ready to proceed with Phase 1 design.
