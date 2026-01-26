package ui

import (
	"bufio"
	"fmt"
	"io"
	"os"
	"strconv"
	"strings"

	"golang.org/x/term"
)

// Prompter handles interactive user prompts.
type Prompter struct {
	reader  io.Reader
	writer  io.Writer
	scanner *bufio.Scanner
	stdin   int // file descriptor for stdin (used for term.ReadPassword)
}

// NewPrompter creates a new Prompter with the given reader and writer.
func NewPrompter(reader io.Reader, writer io.Writer) *Prompter {
	stdin := int(os.Stdin.Fd())
	if f, ok := reader.(*os.File); ok {
		stdin = int(f.Fd())
	}
	return &Prompter{
		reader:  reader,
		writer:  writer,
		scanner: bufio.NewScanner(reader),
		stdin:   stdin,
	}
}

// DefaultPrompter returns a Prompter using stdin/stdout.
func DefaultPrompter() *Prompter {
	return NewPrompter(os.Stdin, os.Stdout)
}

// PromptString prompts for text input with an optional default value.
// If the user presses Enter without input, the default value is returned.
func (p *Prompter) PromptString(prompt, defaultValue string) (string, error) {
	if defaultValue != "" {
		fmt.Fprintf(p.writer, "%s [%s]: ", prompt, defaultValue)
	} else {
		fmt.Fprintf(p.writer, "%s: ", prompt)
	}

	if !p.scanner.Scan() {
		if err := p.scanner.Err(); err != nil {
			return "", err
		}
		// EOF - return default
		fmt.Fprintln(p.writer)
		return defaultValue, nil
	}

	input := strings.TrimSpace(p.scanner.Text())
	if input == "" {
		return defaultValue, nil
	}
	return input, nil
}

// PromptSecret prompts for sensitive input without echoing to the terminal.
// Returns the input as a string.
func (p *Prompter) PromptSecret(prompt string) (string, error) {
	fmt.Fprintf(p.writer, "%s: ", prompt)

	// Check if stdin is a terminal
	if !term.IsTerminal(p.stdin) {
		// Fall back to regular input for non-terminal (e.g., piped input in tests)
		if !p.scanner.Scan() {
			if err := p.scanner.Err(); err != nil {
				return "", err
			}
			return "", nil
		}
		return strings.TrimSpace(p.scanner.Text()), nil
	}

	// Use term.ReadPassword for secure input
	password, err := term.ReadPassword(p.stdin)
	fmt.Fprintln(p.writer) // Add newline after hidden input

	if err != nil {
		return "", err
	}

	return string(password), nil
}

// PromptSecretWithDefault prompts for sensitive input with a masked default.
// If the user presses Enter without input, the existing value is preserved.
func (p *Prompter) PromptSecretWithDefault(prompt string, hasExisting bool) (string, bool, error) {
	if hasExisting {
		fmt.Fprintf(p.writer, "%s [****]: ", prompt)
	} else {
		fmt.Fprintf(p.writer, "%s: ", prompt)
	}

	// Check if stdin is a terminal
	if !term.IsTerminal(p.stdin) {
		if !p.scanner.Scan() {
			if err := p.scanner.Err(); err != nil {
				return "", false, err
			}
			return "", hasExisting, nil
		}
		input := strings.TrimSpace(p.scanner.Text())
		if input == "" {
			return "", hasExisting, nil // Keep existing
		}
		return input, false, nil // New value
	}

	password, err := term.ReadPassword(p.stdin)
	fmt.Fprintln(p.writer)

	if err != nil {
		return "", false, err
	}

	input := string(password)
	if input == "" {
		return "", hasExisting, nil // Keep existing
	}
	return input, false, nil // New value
}

// SelectOption represents a choice in a selection prompt.
type SelectOption struct {
	Value       string
	Label       string
	Description string
}

// PromptSelect prompts the user to select from a numbered list of options.
// Returns the index of the selected option (0-based).
func (p *Prompter) PromptSelect(prompt string, options []SelectOption, defaultIndex int) (int, error) {
	fmt.Fprintln(p.writer, prompt)

	// Display options
	for i, opt := range options {
		if opt.Description != "" {
			fmt.Fprintf(p.writer, "  %d. %-10s - %s\n", i+1, opt.Label, opt.Description)
		} else {
			fmt.Fprintf(p.writer, "  %d. %s\n", i+1, opt.Label)
		}
	}
	fmt.Fprintln(p.writer)

	// Prompt for choice
	defaultDisplay := strconv.Itoa(defaultIndex + 1)
	fmt.Fprintf(p.writer, "Enter choice [1-%d] (default: %s): ", len(options), defaultDisplay)

	if !p.scanner.Scan() {
		if err := p.scanner.Err(); err != nil {
			return 0, err
		}
		return defaultIndex, nil
	}

	input := strings.TrimSpace(p.scanner.Text())
	if input == "" {
		return defaultIndex, nil
	}

	choice, err := strconv.Atoi(input)
	if err != nil || choice < 1 || choice > len(options) {
		return 0, fmt.Errorf("invalid choice: %s (must be 1-%d)", input, len(options))
	}

	return choice - 1, nil
}

// IsTerminal returns true if stdin is connected to a terminal.
func IsTerminal() bool {
	return term.IsTerminal(int(os.Stdin.Fd()))
}

// PromptWithDefault prompts for text input with a default value shown.
// This is an alias for PromptString for convenience.
func (p *Prompter) PromptWithDefault(prompt, defaultValue string) (string, error) {
	return p.PromptString(prompt, defaultValue)
}

// PromptYesNo prompts for a yes/no confirmation.
// Returns true for yes, false for no.
func (p *Prompter) PromptYesNo(prompt string, defaultYes bool) (bool, error) {
	defaultStr := "Y/n"
	if !defaultYes {
		defaultStr = "y/N"
	}

	fmt.Fprintf(p.writer, "%s [%s]: ", prompt, defaultStr)

	if !p.scanner.Scan() {
		if err := p.scanner.Err(); err != nil {
			return false, err
		}
		return defaultYes, nil
	}

	input := strings.ToLower(strings.TrimSpace(p.scanner.Text()))
	if input == "" {
		return defaultYes, nil
	}

	switch input {
	case "y", "yes":
		return true, nil
	case "n", "no":
		return false, nil
	default:
		return defaultYes, nil
	}
}
