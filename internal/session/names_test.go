package session

import (
	"regexp"
	"testing"
)

// TestGetRandomName_GivenEmptyUsedNames_ThenReturnsValidName tests basic name generation.
func TestGetRandomName_GivenEmptyUsedNames_ThenReturnsValidName(t *testing.T) {
	name, err := GetRandomName(nil)

	if err != nil {
		t.Fatalf("GetRandomName() error = %v", err)
	}

	if name == "" {
		t.Error("expected non-empty name")
	}

	// Verify name matches pattern
	pattern := regexp.MustCompile(`^[a-z]{2,15}$`)
	if !pattern.MatchString(name) {
		t.Errorf("name %q does not match pattern ^[a-z]{2,15}$", name)
	}
}

// TestGetRandomName_GivenMultipleCalls_ThenReturnsVariedNames tests randomness.
func TestGetRandomName_GivenMultipleCalls_ThenReturnsVariedNames(t *testing.T) {
	names := make(map[string]bool)
	iterations := 50

	for i := 0; i < iterations; i++ {
		name, err := GetRandomName(nil)
		if err != nil {
			t.Fatalf("GetRandomName() error = %v", err)
		}
		names[name] = true
	}

	// With 50 iterations from 250 names, we should have some variety
	if len(names) < 5 {
		t.Errorf("expected more variety in %d iterations, got only %d unique names", iterations, len(names))
	}
}

// TestGetRandomName_GivenUsedNames_ThenAvoidsCollision tests collision avoidance.
func TestGetRandomName_GivenUsedNames_ThenAvoidsCollision(t *testing.T) {
	usedNames := []string{"alice", "bob", "charlie"}

	for i := 0; i < 20; i++ {
		name, err := GetRandomName(usedNames)
		if err != nil {
			t.Fatalf("GetRandomName() error = %v", err)
		}

		for _, used := range usedNames {
			if name == used {
				t.Errorf("GetRandomName() returned used name %q", name)
			}
		}
	}
}

// TestGetRandomName_GivenCaseVariantUsedNames_ThenNormalizesAndAvoids tests case normalization.
func TestGetRandomName_GivenCaseVariantUsedNames_ThenNormalizesAndAvoids(t *testing.T) {
	// Use mixed case - should still be treated as used
	usedNames := []string{"Alice", "BOB", "Charlie"}

	for i := 0; i < 20; i++ {
		name, err := GetRandomName(usedNames)
		if err != nil {
			t.Fatalf("GetRandomName() error = %v", err)
		}

		// Check against normalized versions
		for _, used := range usedNames {
			if name == NormalizeName(used) {
				t.Errorf("GetRandomName() returned used name %q (normalized from %q)", name, used)
			}
		}
	}
}

// TestGetRandomName_GivenAllNamesUsed_ThenReturnsError tests pool exhaustion.
func TestGetRandomName_GivenAllNamesUsed_ThenReturnsError(t *testing.T) {
	// Use all names in the pool
	usedNames := make([]string, len(namePool))
	copy(usedNames, namePool)

	_, err := GetRandomName(usedNames)

	if err == nil {
		t.Error("expected error when all names are used")
	}

	if err != ErrNoAvailableNames {
		t.Errorf("expected ErrNoAvailableNames, got %v", err)
	}
}

// TestGetRandomName_GivenMostNamesUsed_ThenStillFindsAvailable tests near-exhaustion.
func TestGetRandomName_GivenMostNamesUsed_ThenStillFindsAvailable(t *testing.T) {
	// Use all but 3 names
	usedNames := make([]string, len(namePool)-3)
	copy(usedNames, namePool[:len(namePool)-3])

	name, err := GetRandomName(usedNames)

	if err != nil {
		t.Fatalf("GetRandomName() error = %v", err)
	}

	// Verify the name is one of the remaining 3
	remaining := namePool[len(namePool)-3:]
	found := false
	for _, r := range remaining {
		if name == r {
			found = true
			break
		}
	}

	if !found {
		t.Errorf("expected name from remaining pool %v, got %q", remaining, name)
	}
}

// TestNamePoolSize_ThenReturns250 tests pool size.
func TestNamePoolSize_ThenReturns250(t *testing.T) {
	size := NamePoolSize()

	if size != 250 {
		t.Errorf("NamePoolSize() = %d, want 250", size)
	}
}

// TestNamePool_GivenAllNames_ThenMatchPattern tests all names are valid.
func TestNamePool_GivenAllNames_ThenMatchPattern(t *testing.T) {
	pattern := regexp.MustCompile(`^[a-z]{2,15}$`)

	for _, name := range namePool {
		if !pattern.MatchString(name) {
			t.Errorf("name %q does not match pattern ^[a-z]{2,15}$", name)
		}
	}
}

// TestNamePool_GivenAllNames_ThenNoDuplicates tests no duplicate names.
func TestNamePool_GivenAllNames_ThenNoDuplicates(t *testing.T) {
	seen := make(map[string]bool)

	for _, name := range namePool {
		if seen[name] {
			t.Errorf("duplicate name in pool: %q", name)
		}
		seen[name] = true
	}
}

// TestGetRandomName_GivenRetryScenario_ThenEventuallySucceeds tests retry logic.
func TestGetRandomName_GivenRetryScenario_ThenEventuallySucceeds(t *testing.T) {
	// Use 200 of 250 names - there's still 50 available
	// This should require some retries but eventually succeed
	usedNames := make([]string, 200)
	copy(usedNames, namePool[:200])

	name, err := GetRandomName(usedNames)

	if err != nil {
		t.Fatalf("GetRandomName() error = %v", err)
	}

	// Verify the name is not in the used set
	for _, used := range usedNames {
		if name == used {
			t.Errorf("GetRandomName() returned used name %q", name)
		}
	}
}
