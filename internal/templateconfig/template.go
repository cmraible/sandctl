package templateconfig

import "fmt"

// InitScriptTemplate is the template for new init scripts.
const InitScriptTemplate = `#!/bin/bash
# Init script for template: %s
# This script runs on the sandbox VM after creation.
#
# Available environment variables:
#   SANDCTL_TEMPLATE_NAME       - Original template name
#   SANDCTL_TEMPLATE_NORMALIZED - Normalized template name (lowercase)
#
# Examples:
#   apt-get update && apt-get install -y nodejs npm
#   git clone https://github.com/your/repo.git /home/agent/project
#   cd /home/agent/project && npm install

set -e  # Exit on first error

echo "Template '%s' initialized successfully"
`

// GenerateInitScript creates an init script from the template with the given template name.
func GenerateInitScript(originalName string) string {
	return fmt.Sprintf(InitScriptTemplate, originalName, originalName)
}
