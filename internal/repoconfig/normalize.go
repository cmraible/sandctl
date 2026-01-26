package repoconfig

import (
	"strings"
)

// NormalizeName converts a repository specification to a normalized directory name.
// This ensures case-insensitive matching and valid filesystem paths.
//
// Examples:
//   - "TryGhost/Ghost" -> "tryghost-ghost"
//   - "facebook/react.git" -> "facebook-react"
//   - "owner/repo" -> "owner-repo"
func NormalizeName(repo string) string {
	name := strings.ToLower(repo)
	name = strings.TrimSuffix(name, ".git")
	name = strings.ReplaceAll(name, "/", "-")
	return name
}
