// Package main is the entry point for the sandctl CLI.
package main

import (
	"os"

	"github.com/sandctl/sandctl/internal/cli"
)

// Build information (set via ldflags).
var (
	version   = "dev"
	commit    = "unknown"
	buildTime = "unknown"
)

func main() {
	cli.SetVersionInfo(version, commit, buildTime)
	os.Exit(cli.Execute())
}
