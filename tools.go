//go:build tools

package tools

// Development tool dependencies.
// This file is not compiled into the binary but ensures tool versions
// are tracked in go.mod/go.sum for reproducible builds.
//
// Install with: make install-tools

import (
	_ "github.com/golangci/golangci-lint/cmd/golangci-lint"
)
