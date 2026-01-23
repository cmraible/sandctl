package ui

import (
	"bytes"
	"strings"
	"testing"
)

// TestPromptString_GivenInput_ThenReturnsValue tests basic string input.
func TestPromptString_GivenInput_ThenReturnsValue(t *testing.T) {
	reader := strings.NewReader("test input\n")
	var writer bytes.Buffer
	p := NewPrompter(reader, &writer)

	result, err := p.PromptString("Enter value", "")

	if err != nil {
		t.Fatalf("PromptString() error = %v", err)
	}
	if result != "test input" {
		t.Errorf("result = %q, want %q", result, "test input")
	}
}

// TestPromptString_GivenEmptyInput_ThenReturnsDefault tests default value.
func TestPromptString_GivenEmptyInput_ThenReturnsDefault(t *testing.T) {
	reader := strings.NewReader("\n")
	var writer bytes.Buffer
	p := NewPrompter(reader, &writer)

	result, err := p.PromptString("Enter value", "default")

	if err != nil {
		t.Fatalf("PromptString() error = %v", err)
	}
	if result != "default" {
		t.Errorf("result = %q, want %q", result, "default")
	}
}

// TestPromptString_GivenDefault_ThenShowsInPrompt tests prompt display.
func TestPromptString_GivenDefault_ThenShowsInPrompt(t *testing.T) {
	reader := strings.NewReader("\n")
	var writer bytes.Buffer
	p := NewPrompter(reader, &writer)

	_, _ = p.PromptString("Enter value", "mydefault")

	output := writer.String()
	if !strings.Contains(output, "[mydefault]") {
		t.Errorf("prompt should show default, got: %q", output)
	}
}

// TestPromptString_GivenNoDefault_ThenNoDefaultInPrompt tests prompt without default.
func TestPromptString_GivenNoDefault_ThenNoDefaultInPrompt(t *testing.T) {
	reader := strings.NewReader("value\n")
	var writer bytes.Buffer
	p := NewPrompter(reader, &writer)

	_, _ = p.PromptString("Enter value", "")

	output := writer.String()
	if strings.Contains(output, "[]") {
		t.Errorf("prompt should not show empty brackets, got: %q", output)
	}
}

// TestPromptString_GivenWhitespaceInput_ThenTrimsAndReturns tests trimming.
func TestPromptString_GivenWhitespaceInput_ThenTrimsAndReturns(t *testing.T) {
	reader := strings.NewReader("  spaced value  \n")
	var writer bytes.Buffer
	p := NewPrompter(reader, &writer)

	result, err := p.PromptString("Enter value", "")

	if err != nil {
		t.Fatalf("PromptString() error = %v", err)
	}
	if result != "spaced value" {
		t.Errorf("result = %q, want %q", result, "spaced value")
	}
}

// TestPromptSecret_GivenNonTerminal_ThenReadsNormally tests non-terminal fallback.
func TestPromptSecret_GivenNonTerminal_ThenReadsNormally(t *testing.T) {
	reader := strings.NewReader("secret123\n")
	var writer bytes.Buffer
	p := NewPrompter(reader, &writer)

	result, err := p.PromptSecret("Enter secret")

	if err != nil {
		t.Fatalf("PromptSecret() error = %v", err)
	}
	if result != "secret123" {
		t.Errorf("result = %q, want %q", result, "secret123")
	}
}

// TestPromptSecret_GivenPrompt_ThenDisplaysPrompt tests prompt display.
func TestPromptSecret_GivenPrompt_ThenDisplaysPrompt(t *testing.T) {
	reader := strings.NewReader("secret\n")
	var writer bytes.Buffer
	p := NewPrompter(reader, &writer)

	_, _ = p.PromptSecret("Enter API key")

	output := writer.String()
	if !strings.Contains(output, "Enter API key") {
		t.Errorf("prompt should be displayed, got: %q", output)
	}
}

// TestPromptSecretWithDefault_GivenEmptyInput_ThenKeepsExisting tests preserve.
func TestPromptSecretWithDefault_GivenEmptyInput_ThenKeepsExisting(t *testing.T) {
	reader := strings.NewReader("\n")
	var writer bytes.Buffer
	p := NewPrompter(reader, &writer)

	_, keepExisting, err := p.PromptSecretWithDefault("Enter token", true)

	if err != nil {
		t.Fatalf("PromptSecretWithDefault() error = %v", err)
	}
	if !keepExisting {
		t.Error("should keep existing value on empty input")
	}
}

// TestPromptSecretWithDefault_GivenNewInput_ThenReturnsNew tests new value.
func TestPromptSecretWithDefault_GivenNewInput_ThenReturnsNew(t *testing.T) {
	reader := strings.NewReader("newvalue\n")
	var writer bytes.Buffer
	p := NewPrompter(reader, &writer)

	result, keepExisting, err := p.PromptSecretWithDefault("Enter token", true)

	if err != nil {
		t.Fatalf("PromptSecretWithDefault() error = %v", err)
	}
	if keepExisting {
		t.Error("should not keep existing when new value provided")
	}
	if result != "newvalue" {
		t.Errorf("result = %q, want %q", result, "newvalue")
	}
}

// TestPromptSecretWithDefault_GivenHasExisting_ThenShowsMask tests masked display.
func TestPromptSecretWithDefault_GivenHasExisting_ThenShowsMask(t *testing.T) {
	reader := strings.NewReader("\n")
	var writer bytes.Buffer
	p := NewPrompter(reader, &writer)

	_, _, _ = p.PromptSecretWithDefault("Token", true)

	output := writer.String()
	if !strings.Contains(output, "****") {
		t.Errorf("should show masked value, got: %q", output)
	}
}

// TestPromptSelect_GivenValidChoice_ThenReturnsIndex tests selection.
func TestPromptSelect_GivenValidChoice_ThenReturnsIndex(t *testing.T) {
	reader := strings.NewReader("2\n")
	var writer bytes.Buffer
	p := NewPrompter(reader, &writer)

	options := []SelectOption{
		{Value: "a", Label: "Option A", Description: "First option"},
		{Value: "b", Label: "Option B", Description: "Second option"},
		{Value: "c", Label: "Option C", Description: "Third option"},
	}

	result, err := p.PromptSelect("Choose one:", options, 0)

	if err != nil {
		t.Fatalf("PromptSelect() error = %v", err)
	}
	if result != 1 { // 0-indexed
		t.Errorf("result = %d, want 1", result)
	}
}

// TestPromptSelect_GivenEmptyInput_ThenReturnsDefault tests default selection.
func TestPromptSelect_GivenEmptyInput_ThenReturnsDefault(t *testing.T) {
	reader := strings.NewReader("\n")
	var writer bytes.Buffer
	p := NewPrompter(reader, &writer)

	options := []SelectOption{
		{Value: "a", Label: "Option A"},
		{Value: "b", Label: "Option B"},
	}

	result, err := p.PromptSelect("Choose:", options, 1)

	if err != nil {
		t.Fatalf("PromptSelect() error = %v", err)
	}
	if result != 1 {
		t.Errorf("result = %d, want 1 (default)", result)
	}
}

// TestPromptSelect_GivenInvalidChoice_ThenReturnsError tests invalid input.
func TestPromptSelect_GivenInvalidChoice_ThenReturnsError(t *testing.T) {
	reader := strings.NewReader("5\n")
	var writer bytes.Buffer
	p := NewPrompter(reader, &writer)

	options := []SelectOption{
		{Value: "a", Label: "A"},
		{Value: "b", Label: "B"},
	}

	_, err := p.PromptSelect("Choose:", options, 0)

	if err == nil {
		t.Error("expected error for invalid choice")
	}
}

// TestPromptSelect_GivenNonNumericInput_ThenReturnsError tests non-numeric input.
func TestPromptSelect_GivenNonNumericInput_ThenReturnsError(t *testing.T) {
	reader := strings.NewReader("abc\n")
	var writer bytes.Buffer
	p := NewPrompter(reader, &writer)

	options := []SelectOption{
		{Value: "a", Label: "A"},
	}

	_, err := p.PromptSelect("Choose:", options, 0)

	if err == nil {
		t.Error("expected error for non-numeric input")
	}
}

// TestPromptSelect_GivenOptions_ThenDisplaysAll tests option display.
func TestPromptSelect_GivenOptions_ThenDisplaysAll(t *testing.T) {
	reader := strings.NewReader("1\n")
	var writer bytes.Buffer
	p := NewPrompter(reader, &writer)

	options := []SelectOption{
		{Value: "claude", Label: "claude", Description: "Anthropic Claude"},
		{Value: "codex", Label: "codex", Description: "OpenAI Codex"},
	}

	_, _ = p.PromptSelect("Select agent:", options, 0)

	output := writer.String()
	if !strings.Contains(output, "claude") {
		t.Error("should display claude option")
	}
	if !strings.Contains(output, "codex") {
		t.Error("should display codex option")
	}
	if !strings.Contains(output, "Anthropic Claude") {
		t.Error("should display descriptions")
	}
}

// TestNewPrompter_GivenReadWriter_ThenStoresReferences tests constructor.
func TestNewPrompter_GivenReadWriter_ThenStoresReferences(t *testing.T) {
	reader := strings.NewReader("")
	var writer bytes.Buffer

	p := NewPrompter(reader, &writer)

	if p == nil {
		t.Fatal("expected non-nil Prompter")
	}
}

// TestDefaultPrompter_GivenCall_ThenReturnsPrompter tests default constructor.
func TestDefaultPrompter_GivenCall_ThenReturnsPrompter(t *testing.T) {
	p := DefaultPrompter()

	if p == nil {
		t.Fatal("expected non-nil Prompter")
	}
}

// TestIsTerminal_GivenCall_ThenReturnsBool tests terminal detection.
func TestIsTerminal_GivenCall_ThenReturnsBool(t *testing.T) {
	// In test environment, stdin is not a terminal
	result := IsTerminal()

	// We can't guarantee the result, but it should not panic
	_ = result
}
