package session

import (
	"regexp"
)

// idPattern validates human-readable session names.
// Names must be 2-15 lowercase letters only.
var idPattern = regexp.MustCompile(`^[a-z]{2,15}$`)

// GenerateID creates a new unique session ID by selecting a random human name.
// The usedNames parameter should contain all currently active session names
// to avoid collisions.
func GenerateID(usedNames []string) (string, error) {
	return GetRandomName(usedNames)
}

// ValidateID checks if a session ID has the correct format.
// Valid IDs are 2-15 lowercase letters (human first names).
func ValidateID(id string) bool {
	return idPattern.MatchString(NormalizeName(id))
}
