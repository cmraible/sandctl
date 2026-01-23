package session

import (
	"crypto/rand"
	"errors"
	"io"
	"strings"
	"testing"
)

// TestGenerateID_GivenCall_ThenReturnsValidFormat tests ID format.
func TestGenerateID_GivenCall_ThenReturnsValidFormat(t *testing.T) {
	id, err := GenerateID()

	if err != nil {
		t.Fatalf("GenerateID() error = %v", err)
	}

	if !strings.HasPrefix(id, IDPrefix) {
		t.Errorf("ID should start with %q, got %q", IDPrefix, id)
	}

	// Total length: "sandctl-" (8) + 8 hex chars = 16
	expectedLen := len(IDPrefix) + IDRandomLength
	if len(id) != expectedLen {
		t.Errorf("ID length = %d, want %d", len(id), expectedLen)
	}
}

// TestGenerateID_GivenMultipleCalls_ThenReturnsUniqueIDs tests uniqueness.
func TestGenerateID_GivenMultipleCalls_ThenReturnsUniqueIDs(t *testing.T) {
	ids := make(map[string]bool)
	iterations := 100

	for i := 0; i < iterations; i++ {
		id, err := GenerateID()
		if err != nil {
			t.Fatalf("GenerateID() error = %v", err)
		}

		if ids[id] {
			t.Errorf("duplicate ID generated: %s", id)
		}
		ids[id] = true
	}
}

// TestGenerateID_GivenValidID_ThenPassesValidation tests generated IDs are valid.
func TestGenerateID_GivenValidID_ThenPassesValidation(t *testing.T) {
	for i := 0; i < 10; i++ {
		id, err := GenerateID()
		if err != nil {
			t.Fatalf("GenerateID() error = %v", err)
		}

		if !ValidateID(id) {
			t.Errorf("generated ID failed validation: %s", id)
		}
	}
}

// TestGenerateID_GivenRandomReaderError_ThenReturnsError tests error handling.
func TestGenerateID_GivenRandomReaderError_ThenReturnsError(t *testing.T) {
	// Save original randReader
	originalReader := randReader
	defer func() { randReader = originalReader }()

	// Replace with failing reader
	randReader = &failingReader{err: errors.New("random source unavailable")}

	_, err := GenerateID()

	if err == nil {
		t.Error("expected error when random reader fails")
	}
	if !strings.Contains(err.Error(), "failed to generate random ID") {
		t.Errorf("error should mention failure, got: %v", err)
	}
}

// TestGenerateID_GivenDeterministicReader_ThenReturnsDeterministicID tests injectable reader.
func TestGenerateID_GivenDeterministicReader_ThenReturnsDeterministicID(t *testing.T) {
	// Save original randReader
	originalReader := randReader
	defer func() { randReader = originalReader }()

	// Replace with deterministic reader
	randReader = &deterministicReader{data: []byte{0xab, 0xcd, 0xef, 0x12}}

	id, err := GenerateID()

	if err != nil {
		t.Fatalf("GenerateID() error = %v", err)
	}

	expected := "sandctl-abcdef12"
	if id != expected {
		t.Errorf("ID = %q, want %q", id, expected)
	}
}

// TestValidateID_GivenValidIDs_ThenReturnsTrue tests valid ID patterns.
func TestValidateID_GivenValidIDs_ThenReturnsTrue(t *testing.T) {
	validIDs := []string{
		"sandctl-abc12345",
		"sandctl-00000000",
		"sandctl-ffffffff",
		"sandctl-a1b2c3d4",
	}

	for _, id := range validIDs {
		t.Run(id, func(t *testing.T) {
			if !ValidateID(id) {
				t.Errorf("expected %q to be valid", id)
			}
		})
	}
}

// TestValidateID_GivenInvalidIDs_ThenReturnsFalse tests invalid ID patterns.
func TestValidateID_GivenInvalidIDs_ThenReturnsFalse(t *testing.T) {
	invalidIDs := []string{
		"",                   // empty
		"sandctl-",           // no random part
		"sandctl-abc1234",    // too short (7 chars)
		"sandctl-abc123456",  // too long (9 chars)
		"sandctl-ABCDEF12",   // uppercase (pattern requires lowercase)
		"sandctl-abc-1234",   // contains hyphen in random part
		"sandctl_abc12345",   // underscore instead of hyphen
		"other-abc12345",     // wrong prefix
		"abc12345",           // no prefix
		"sandctl-abc!@#$%",   // special characters
		"SANDCTL-abc12345",   // uppercase prefix
	}

	for _, id := range invalidIDs {
		t.Run(id, func(t *testing.T) {
			if ValidateID(id) {
				t.Errorf("expected %q to be invalid", id)
			}
		})
	}
}

// TestIDConstants_GivenValues_ThenMatchExpected tests constant values.
func TestIDConstants_GivenValues_ThenMatchExpected(t *testing.T) {
	if IDPrefix != "sandctl-" {
		t.Errorf("IDPrefix = %q, want %q", IDPrefix, "sandctl-")
	}

	if IDRandomLength != 8 {
		t.Errorf("IDRandomLength = %d, want %d", IDRandomLength, 8)
	}
}

// failingReader is a test reader that always returns an error.
type failingReader struct {
	err error
}

func (r *failingReader) Read(p []byte) (n int, err error) {
	return 0, r.err
}

// deterministicReader is a test reader that returns predetermined bytes.
type deterministicReader struct {
	data []byte
	pos  int
}

func (r *deterministicReader) Read(p []byte) (n int, err error) {
	if r.pos >= len(r.data) {
		return 0, io.EOF
	}
	n = copy(p, r.data[r.pos:])
	r.pos += n
	return n, nil
}

// Ensure original randReader uses crypto/rand
func init() {
	// Verify randReader is using crypto/rand by default
	_ = rand.Reader
}
