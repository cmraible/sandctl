package session

import (
	"regexp"
	"testing"
)

// TestGenerateID_GivenEmptyUsedNames_ThenReturnsValidHumanName tests ID format.
func TestGenerateID_GivenEmptyUsedNames_ThenReturnsValidHumanName(t *testing.T) {
	id, err := GenerateID(nil)

	if err != nil {
		t.Fatalf("GenerateID() error = %v", err)
	}

	if id == "" {
		t.Error("expected non-empty ID")
	}

	// Verify ID is a human name (2-15 lowercase letters)
	pattern := regexp.MustCompile(`^[a-z]{2,15}$`)
	if !pattern.MatchString(id) {
		t.Errorf("ID %q does not match human name pattern ^[a-z]{2,15}$", id)
	}
}

// TestGenerateID_GivenUsedNames_ThenAvoidsCollision tests collision avoidance.
func TestGenerateID_GivenUsedNames_ThenAvoidsCollision(t *testing.T) {
	usedNames := []string{"alice", "bob", "charlie"}

	for i := 0; i < 20; i++ {
		id, err := GenerateID(usedNames)
		if err != nil {
			t.Fatalf("GenerateID() error = %v", err)
		}

		for _, used := range usedNames {
			if id == used {
				t.Errorf("GenerateID() returned used name %q", id)
			}
		}
	}
}

// TestGenerateID_GivenMultipleCalls_ThenReturnsUniqueIDs tests uniqueness.
func TestGenerateID_GivenMultipleCalls_ThenReturnsUniqueIDs(t *testing.T) {
	ids := make(map[string]bool)
	usedNames := []string{}

	for i := 0; i < 20; i++ {
		id, err := GenerateID(usedNames)
		if err != nil {
			t.Fatalf("GenerateID() error = %v", err)
		}

		if ids[id] {
			t.Errorf("duplicate ID generated: %s", id)
		}
		ids[id] = true
		usedNames = append(usedNames, id)
	}
}

// TestGenerateID_GivenValidID_ThenPassesValidation tests generated IDs are valid.
func TestGenerateID_GivenValidID_ThenPassesValidation(t *testing.T) {
	for i := 0; i < 10; i++ {
		id, err := GenerateID(nil)
		if err != nil {
			t.Fatalf("GenerateID() error = %v", err)
		}

		if !ValidateID(id) {
			t.Errorf("generated ID failed validation: %s", id)
		}
	}
}

// TestValidateID_GivenValidHumanNames_ThenReturnsTrue tests valid human names.
func TestValidateID_GivenValidHumanNames_ThenReturnsTrue(t *testing.T) {
	validIDs := []string{
		"alice",
		"bob",
		"charlie",
		"diana",
		"emma",
		"marcus",
		"sofia",
		"christopher", // 11 chars
		"ab",          // minimum 2 chars
	}

	for _, id := range validIDs {
		t.Run(id, func(t *testing.T) {
			if !ValidateID(id) {
				t.Errorf("expected %q to be valid", id)
			}
		})
	}
}

// TestValidateID_GivenCaseVariants_ThenReturnsTrue tests case insensitivity.
func TestValidateID_GivenCaseVariants_ThenReturnsTrue(t *testing.T) {
	caseVariants := []string{
		"Alice",
		"ALICE",
		"AlIcE",
		"BOB",
		"Marcus",
	}

	for _, id := range caseVariants {
		t.Run(id, func(t *testing.T) {
			if !ValidateID(id) {
				t.Errorf("expected %q to be valid (case-insensitive)", id)
			}
		})
	}
}

// TestValidateID_GivenInvalidIDs_ThenReturnsFalse tests invalid ID patterns.
func TestValidateID_GivenInvalidIDs_ThenReturnsFalse(t *testing.T) {
	invalidIDs := []string{
		"",                 // empty
		"a",                // too short (1 char)
		"abcdefghijklmnop", // too long (16 chars)
		"alice123",         // contains numbers
		"alice-bob",        // contains hyphen
		"alice_bob",        // contains underscore
		"alice bob",        // contains space
		"sandctl-abc12345", // old format
		"alice!",           // special character
		"123",              // all numbers
	}

	for _, id := range invalidIDs {
		t.Run(id, func(t *testing.T) {
			if ValidateID(id) {
				t.Errorf("expected %q to be invalid", id)
			}
		})
	}
}
