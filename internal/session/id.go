package session

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"io"
	"regexp"
)

const (
	// IDPrefix is the prefix for all session IDs.
	IDPrefix = "sandctl-"
	// IDRandomLength is the length of the random part of the ID.
	IDRandomLength = 8
)

var idPattern = regexp.MustCompile(`^sandctl-[a-z0-9]{8}$`)

// randReader is the source of random bytes for ID generation.
// It can be replaced in tests for deterministic output.
var randReader io.Reader = rand.Reader

// GenerateID creates a new unique session ID.
func GenerateID() (string, error) {
	bytes := make([]byte, IDRandomLength/2)
	if _, err := randReader.Read(bytes); err != nil {
		return "", fmt.Errorf("failed to generate random ID: %w", err)
	}
	return IDPrefix + hex.EncodeToString(bytes), nil
}

// ValidateID checks if a session ID has the correct format.
func ValidateID(id string) bool {
	return idPattern.MatchString(id)
}
