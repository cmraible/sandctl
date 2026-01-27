package repo

import (
	"strings"
	"testing"
)

func TestParse_Shorthand(t *testing.T) {
	tests := []struct {
		name      string
		input     string
		wantOwner string
		wantName  string
		wantURL   string
	}{
		{
			name:      "simple owner/repo",
			input:     "TryGhost/Ghost",
			wantOwner: "TryGhost",
			wantName:  "Ghost",
			wantURL:   "https://github.com/TryGhost/Ghost.git",
		},
		{
			name:      "owner with hyphen",
			input:     "my-org/my-repo",
			wantOwner: "my-org",
			wantName:  "my-repo",
			wantURL:   "https://github.com/my-org/my-repo.git",
		},
		{
			name:      "repo with underscore",
			input:     "owner/my_repo",
			wantOwner: "owner",
			wantName:  "my_repo",
			wantURL:   "https://github.com/owner/my_repo.git",
		},
		{
			name:      "repo with dot",
			input:     "owner/repo.js",
			wantOwner: "owner",
			wantName:  "repo.js",
			wantURL:   "https://github.com/owner/repo.js.git",
		},
		{
			name:      "single char owner and repo",
			input:     "a/b",
			wantOwner: "a",
			wantName:  "b",
			wantURL:   "https://github.com/a/b.git",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			spec, err := Parse(tt.input)
			if err != nil {
				t.Fatalf("Parse(%q) returned error: %v", tt.input, err)
			}

			if spec.Owner != tt.wantOwner {
				t.Errorf("Owner = %q, want %q", spec.Owner, tt.wantOwner)
			}
			if spec.Name != tt.wantName {
				t.Errorf("Name = %q, want %q", spec.Name, tt.wantName)
			}
			if spec.CloneURL != tt.wantURL {
				t.Errorf("CloneURL = %q, want %q", spec.CloneURL, tt.wantURL)
			}
		})
	}
}

func TestParse_GitHubURL(t *testing.T) {
	tests := []struct {
		name      string
		input     string
		wantOwner string
		wantName  string
		wantURL   string
	}{
		{
			name:      "full URL without .git",
			input:     "https://github.com/TryGhost/Ghost",
			wantOwner: "TryGhost",
			wantName:  "Ghost",
			wantURL:   "https://github.com/TryGhost/Ghost.git",
		},
		{
			name:      "full URL with .git",
			input:     "https://github.com/TryGhost/Ghost.git",
			wantOwner: "TryGhost",
			wantName:  "Ghost",
			wantURL:   "https://github.com/TryGhost/Ghost.git",
		},
		{
			name:      "URL with hyphen in owner",
			input:     "https://github.com/my-org/repo",
			wantOwner: "my-org",
			wantName:  "repo",
			wantURL:   "https://github.com/my-org/repo.git",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			spec, err := Parse(tt.input)
			if err != nil {
				t.Fatalf("Parse(%q) returned error: %v", tt.input, err)
			}

			if spec.Owner != tt.wantOwner {
				t.Errorf("Owner = %q, want %q", spec.Owner, tt.wantOwner)
			}
			if spec.Name != tt.wantName {
				t.Errorf("Name = %q, want %q", spec.Name, tt.wantName)
			}
			if spec.CloneURL != tt.wantURL {
				t.Errorf("CloneURL = %q, want %q", spec.CloneURL, tt.wantURL)
			}
		})
	}
}

func TestParse_ValidationErrors(t *testing.T) {
	tests := []struct {
		name      string
		input     string
		wantError string
	}{
		{
			name:      "empty string",
			input:     "",
			wantError: "repository specification is required",
		},
		{
			name:      "whitespace only",
			input:     "   ",
			wantError: "repository specification is required",
		},
		{
			name:      "no slash",
			input:     "invalid",
			wantError: "invalid format",
		},
		{
			name:      "too many slashes",
			input:     "a/b/c",
			wantError: "invalid format",
		},
		{
			name:      "owner starts with hyphen",
			input:     "-owner/repo",
			wantError: "cannot start with hyphen",
		},
		{
			name:      "owner ends with hyphen",
			input:     "owner-/repo",
			wantError: "cannot end with hyphen",
		},
		{
			name:      "empty repo",
			input:     "owner/",
			wantError: "cannot be empty",
		},
		{
			name:      "empty owner",
			input:     "/repo",
			wantError: "cannot be empty",
		},
		{
			name:      "non-GitHub URL",
			input:     "https://gitlab.com/owner/repo",
			wantError: "only GitHub repositories are supported",
		},
		{
			name:      "invalid GitHub URL format",
			input:     "https://github.com/owner",
			wantError: "invalid GitHub URL format",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := Parse(tt.input)
			if err == nil {
				t.Fatalf("Parse(%q) should have returned an error", tt.input)
			}

			if !strings.Contains(err.Error(), tt.wantError) {
				t.Errorf("error = %q, want error containing %q", err.Error(), tt.wantError)
			}
		})
	}
}

func TestRepoSpec_TargetPath(t *testing.T) {
	spec := &Spec{
		Owner: "TryGhost",
		Name:  "Ghost",
	}

	want := "/home/agent/Ghost"
	if got := spec.TargetPath(); got != want {
		t.Errorf("TargetPath() = %q, want %q", got, want)
	}
}

func TestRepoSpec_String(t *testing.T) {
	spec := &Spec{
		Owner: "TryGhost",
		Name:  "Ghost",
	}

	want := "TryGhost/Ghost"
	if got := spec.String(); got != want {
		t.Errorf("String() = %q, want %q", got, want)
	}
}
