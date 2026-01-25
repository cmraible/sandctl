// Package repo provides repository URL parsing and validation.
package repo

import (
	"fmt"
	"regexp"
	"strings"
)

// Spec represents a parsed GitHub repository specification.
type Spec struct {
	Owner    string // GitHub owner/organization name
	Name     string // Repository name
	CloneURL string // Full HTTPS clone URL
}

// TargetPath returns the path where the repository should be cloned.
func (r *Spec) TargetPath() string {
	return "/home/sprite/" + r.Name
}

// String returns the shorthand representation (owner/name).
func (r *Spec) String() string {
	return r.Owner + "/" + r.Name
}

// Validation patterns
var (
	// Owner: 1-39 chars, alphanumeric + hyphen, no leading/trailing hyphen
	ownerPattern = regexp.MustCompile(`^[a-zA-Z0-9]([a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$`)

	// Repo: 1-100 chars, alphanumeric + hyphen + underscore + dot
	repoPattern = regexp.MustCompile(`^[a-zA-Z0-9._-]{1,100}$`)

	// GitHub URL pattern: https://github.com/owner/repo[.git]
	githubURLPattern = regexp.MustCompile(`^https://github\.com/([^/]+)/([^/]+?)(?:\.git)?$`)
)

// Parse parses a repository specification from user input.
// Accepts both shorthand format (owner/repo) and full GitHub URLs.
func Parse(input string) (*Spec, error) {
	input = strings.TrimSpace(input)
	if input == "" {
		return nil, fmt.Errorf("repository specification is required")
	}

	var owner, name string

	// Check if it's a URL
	if strings.HasPrefix(input, "https://") {
		// Must be a GitHub URL
		if !strings.HasPrefix(input, "https://github.com/") {
			return nil, fmt.Errorf("only GitHub repositories are supported")
		}

		matches := githubURLPattern.FindStringSubmatch(input)
		if matches == nil {
			return nil, fmt.Errorf("invalid GitHub URL format: expected https://github.com/owner/repo")
		}

		owner = matches[1]
		name = matches[2]
	} else {
		// Shorthand format: owner/repo
		parts := strings.Split(input, "/")
		if len(parts) != 2 {
			return nil, fmt.Errorf("invalid format: expected 'owner/repo' or GitHub URL")
		}

		owner = parts[0]
		name = parts[1]
	}

	// Validate owner
	if err := validateOwner(owner); err != nil {
		return nil, err
	}

	// Validate repo name
	if err := validateRepo(name); err != nil {
		return nil, err
	}

	// Construct clone URL
	cloneURL := fmt.Sprintf("https://github.com/%s/%s.git", owner, name)

	return &Spec{
		Owner:    owner,
		Name:     name,
		CloneURL: cloneURL,
	}, nil
}

// validateOwner validates the repository owner/organization name.
func validateOwner(owner string) error {
	if owner == "" {
		return fmt.Errorf("invalid owner: cannot be empty")
	}

	if len(owner) > 39 {
		return fmt.Errorf("invalid owner: cannot exceed 39 characters")
	}

	if strings.HasPrefix(owner, "-") {
		return fmt.Errorf("invalid owner: cannot start with hyphen")
	}

	if strings.HasSuffix(owner, "-") {
		return fmt.Errorf("invalid owner: cannot end with hyphen")
	}

	if !ownerPattern.MatchString(owner) {
		return fmt.Errorf("invalid owner: must be alphanumeric with optional hyphens")
	}

	return nil
}

// validateRepo validates the repository name.
func validateRepo(name string) error {
	if name == "" {
		return fmt.Errorf("invalid repo: cannot be empty")
	}

	if len(name) > 100 {
		return fmt.Errorf("invalid repo: cannot exceed 100 characters")
	}

	if !repoPattern.MatchString(name) {
		return fmt.Errorf("invalid repo: must be alphanumeric with optional hyphens, underscores, and dots")
	}

	return nil
}
