package repoconfig

import "fmt"

// InitScriptTemplate is the template for new init scripts.
// The %s placeholder should be replaced with the original repository name.
const InitScriptTemplate = `#!/bin/bash
# Init script for %s
# This script runs in the sprite after the repository is cloned.
# Working directory: /home/sprite/<repo-name>
#
# Common tasks:
# - Install dependencies: npm install, yarn, pip install -r requirements.txt
# - Install system packages: sudo apt-get install -y <package>
# - Set up environment: export VAR=value
# - Build the project: make, cargo build, etc.
#
# The script output is displayed during 'sandctl new -R %s'
# Exit code 0 = success, non-zero = failure (console won't start automatically)

set -e  # Exit on first error

# Add your initialization commands below:

`

// GenerateInitScript creates an init script from the template with the given repo name.
func GenerateInitScript(originalName string) string {
	return fmt.Sprintf(InitScriptTemplate, originalName, originalName)
}
