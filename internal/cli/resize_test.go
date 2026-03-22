package cli

import (
	"testing"
)

// TestResizeCmd_GivenNoArgs_ThenReturnsError tests that resize requires arguments.
func TestResizeCmd_GivenNoArgs_ThenReturnsError(t *testing.T) {
	rootCmd.SetArgs([]string{"resize"})
	err := rootCmd.Execute()
	if err == nil {
		t.Error("expected error when no arguments provided")
	}
}

// TestResizeCmd_GivenOneArg_ThenReturnsError tests that resize requires two arguments.
func TestResizeCmd_GivenOneArg_ThenReturnsError(t *testing.T) {
	rootCmd.SetArgs([]string{"resize", "mysession"})
	err := rootCmd.Execute()
	if err == nil {
		t.Error("expected error when only one argument provided")
	}
}

// TestResizeCmd_GivenHelp_ThenShowsHelp tests help output.
func TestResizeCmd_GivenHelp_ThenShowsHelp(t *testing.T) {
	rootCmd.SetArgs([]string{"resize", "--help"})
	err := rootCmd.Execute()
	if err != nil {
		t.Errorf("Execute(resize --help) error = %v", err)
	}
}

// TestResizeCmdFlags tests that flags are registered.
func TestResizeCmdFlags(t *testing.T) {
	f := resizeCmd.Flags()

	forceFlag := f.Lookup("force")
	if forceFlag == nil {
		t.Error("expected --force flag to be registered")
	}
	if forceFlag.Shorthand != "f" {
		t.Errorf("--force shorthand = %q, want %q", forceFlag.Shorthand, "f")
	}

	upgradeDiskFlag := f.Lookup("upgrade-disk")
	if upgradeDiskFlag == nil {
		t.Error("expected --upgrade-disk flag to be registered")
	}
	if upgradeDiskFlag.DefValue != "false" {
		t.Errorf("--upgrade-disk default = %q, want %q", upgradeDiskFlag.DefValue, "false")
	}
}
