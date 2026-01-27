package templateconfig

import (
	"regexp"
	"strings"
)

// NormalizeName converts a user-provided name to a filesystem-safe format.
// This ensures case-insensitive matching and valid filesystem paths.
//
// Examples:
//   - "Ghost" -> "ghost"
//   - "My API" -> "my-api"
//   - "React/Vue" -> "react-vue"
//   - "my--name" -> "my-name"
func NormalizeName(name string) string {
	// Convert to lowercase
	name = strings.ToLower(name)
	// Replace spaces and special chars with hyphens
	name = regexp.MustCompile(`[^a-z0-9-]`).ReplaceAllString(name, "-")
	// Collapse multiple hyphens
	name = regexp.MustCompile(`-+`).ReplaceAllString(name, "-")
	// Trim leading/trailing hyphens
	name = strings.Trim(name, "-")
	return name
}
