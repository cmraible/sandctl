package cli

import (
	"testing"
	"time"

	"github.com/sandctl/sandctl/internal/session"
)

// TestMapSpriteState_GivenRunning_ThenReturnsRunningStatus tests running state mapping.
func TestMapSpriteState_GivenRunning_ThenReturnsRunningStatus(t *testing.T) {
	status := mapSpriteState("running")

	if status != session.StatusRunning {
		t.Errorf("mapSpriteState(running) = %q, want %q", status, session.StatusRunning)
	}
}

// TestMapSpriteState_GivenStopped_ThenReturnsStoppedStatus tests stopped state mapping.
func TestMapSpriteState_GivenStopped_ThenReturnsStoppedStatus(t *testing.T) {
	status := mapSpriteState("stopped")

	if status != session.StatusStopped {
		t.Errorf("mapSpriteState(stopped) = %q, want %q", status, session.StatusStopped)
	}
}

// TestMapSpriteState_GivenDestroyed_ThenReturnsStoppedStatus tests destroyed state mapping.
func TestMapSpriteState_GivenDestroyed_ThenReturnsStoppedStatus(t *testing.T) {
	status := mapSpriteState("destroyed")

	if status != session.StatusStopped {
		t.Errorf("mapSpriteState(destroyed) = %q, want %q", status, session.StatusStopped)
	}
}

// TestMapSpriteState_GivenFailed_ThenReturnsFailedStatus tests failed state mapping.
func TestMapSpriteState_GivenFailed_ThenReturnsFailedStatus(t *testing.T) {
	status := mapSpriteState("failed")

	if status != session.StatusFailed {
		t.Errorf("mapSpriteState(failed) = %q, want %q", status, session.StatusFailed)
	}
}

// TestMapSpriteState_GivenUnknown_ThenReturnsProvisioning tests unknown state mapping.
func TestMapSpriteState_GivenUnknown_ThenReturnsProvisioning(t *testing.T) {
	unknownStates := []string{"pending", "starting", "unknown", "", "other"}

	for _, state := range unknownStates {
		t.Run(state, func(t *testing.T) {
			status := mapSpriteState(state)
			if status != session.StatusProvisioning {
				t.Errorf("mapSpriteState(%q) = %q, want %q", state, status, session.StatusProvisioning)
			}
		})
	}
}

// TestFormatTimeout_GivenNil_ThenReturnsDash tests nil timeout formatting.
func TestFormatTimeout_GivenNil_ThenReturnsDash(t *testing.T) {
	result := formatTimeout(nil)

	if result != "-" {
		t.Errorf("formatTimeout(nil) = %q, want %q", result, "-")
	}
}

// TestFormatTimeout_GivenZero_ThenReturnsExpired tests zero timeout formatting.
func TestFormatTimeout_GivenZero_ThenReturnsExpired(t *testing.T) {
	zero := time.Duration(0)
	result := formatTimeout(&zero)

	if result != "expired" {
		t.Errorf("formatTimeout(0) = %q, want %q", result, "expired")
	}
}

// TestFormatTimeout_GivenNegative_ThenReturnsExpired tests negative timeout formatting.
func TestFormatTimeout_GivenNegative_ThenReturnsExpired(t *testing.T) {
	negative := -5 * time.Minute
	result := formatTimeout(&negative)

	if result != "expired" {
		t.Errorf("formatTimeout(-5m) = %q, want %q", result, "expired")
	}
}

// TestFormatTimeout_GivenHours_ThenReturnsHoursFormat tests hours formatting.
func TestFormatTimeout_GivenHours_ThenReturnsHoursFormat(t *testing.T) {
	twoHours := 2 * time.Hour
	result := formatTimeout(&twoHours)

	if result != "2h remaining" {
		t.Errorf("formatTimeout(2h) = %q, want %q", result, "2h remaining")
	}
}

// TestFormatTimeout_GivenMinutes_ThenReturnsMinutesFormat tests minutes formatting.
func TestFormatTimeout_GivenMinutes_ThenReturnsMinutesFormat(t *testing.T) {
	thirtyMin := 30 * time.Minute
	result := formatTimeout(&thirtyMin)

	if result != "30m remaining" {
		t.Errorf("formatTimeout(30m) = %q, want %q", result, "30m remaining")
	}
}

// TestFormatTimeout_GivenHourPlusMinutes_ThenReturnsHoursFormat tests mixed duration.
func TestFormatTimeout_GivenHourPlusMinutes_ThenReturnsHoursFormat(t *testing.T) {
	ninetyMin := 90 * time.Minute
	result := formatTimeout(&ninetyMin)

	if result != "1h remaining" {
		t.Errorf("formatTimeout(90m) = %q, want %q", result, "1h remaining")
	}
}

// TestFormatTimeout_GivenSmallMinutes_ThenReturnsMinutesFormat tests small values.
func TestFormatTimeout_GivenSmallMinutes_ThenReturnsMinutesFormat(t *testing.T) {
	fiveMin := 5 * time.Minute
	result := formatTimeout(&fiveMin)

	if result != "5m remaining" {
		t.Errorf("formatTimeout(5m) = %q, want %q", result, "5m remaining")
	}
}

// TestFormatCreatedTime_GivenTime_ThenReturnsFormattedString tests time formatting.
func TestFormatCreatedTime_GivenTime_ThenReturnsFormattedString(t *testing.T) {
	// Create a specific time for testing
	testTime := time.Date(2024, 6, 15, 14, 30, 45, 0, time.UTC)
	result := formatCreatedTime(testTime)

	// Result will be in local time, but should contain these components
	if len(result) < 10 {
		t.Errorf("formatCreatedTime result too short: %q", result)
	}

	// Check format pattern: YYYY-MM-DD HH:MM:SS
	if result[4] != '-' || result[7] != '-' || result[10] != ' ' {
		t.Errorf("formatCreatedTime format unexpected: %q", result)
	}
}

// TestSetVersionInfo_GivenValues_ThenSetsGlobals tests version info setting.
func TestSetVersionInfo_GivenValues_ThenSetsGlobals(t *testing.T) {
	// Save original values
	origVersion := version
	origCommit := commit
	origBuildTime := buildTime
	defer func() {
		version = origVersion
		commit = origCommit
		buildTime = origBuildTime
	}()

	SetVersionInfo("1.2.3", "abc123", "2024-06-15")

	if version != "1.2.3" {
		t.Errorf("version = %q, want %q", version, "1.2.3")
	}
	if commit != "abc123" {
		t.Errorf("commit = %q, want %q", commit, "abc123")
	}
	if buildTime != "2024-06-15" {
		t.Errorf("buildTime = %q, want %q", buildTime, "2024-06-15")
	}
}

// TestRootCmd_GivenNoArgs_ThenDoesNotError tests basic execution.
func TestRootCmd_GivenNoArgs_ThenDoesNotError(t *testing.T) {
	// Reset command state for testing
	rootCmd.SetArgs([]string{})

	err := rootCmd.Execute()

	// Should not error when showing help
	if err != nil {
		t.Errorf("Execute() error = %v", err)
	}
}

// TestRootCmd_GivenHelpFlag_ThenShowsHelp tests help flag.
func TestRootCmd_GivenHelpFlag_ThenShowsHelp(t *testing.T) {
	rootCmd.SetArgs([]string{"--help"})

	err := rootCmd.Execute()

	if err != nil {
		t.Errorf("Execute(--help) error = %v", err)
	}
}

// TestVersionCmd_GivenCall_ThenSucceeds tests version command.
func TestVersionCmd_GivenCall_ThenSucceeds(t *testing.T) {
	rootCmd.SetArgs([]string{"version"})

	err := rootCmd.Execute()

	if err != nil {
		t.Errorf("Execute(version) error = %v", err)
	}
}

// TestIsVerbose_GivenDefault_ThenReturnsFalse tests verbose default.
func TestIsVerbose_GivenDefault_ThenReturnsFalse(t *testing.T) {
	// Save and restore
	origVerbose := verbose
	defer func() { verbose = origVerbose }()

	verbose = false
	if isVerbose() {
		t.Error("expected isVerbose() to return false")
	}
}

// TestIsVerbose_GivenTrue_ThenReturnsTrue tests verbose flag.
func TestIsVerbose_GivenTrue_ThenReturnsTrue(t *testing.T) {
	// Save and restore
	origVerbose := verbose
	defer func() { verbose = origVerbose }()

	verbose = true
	if !isVerbose() {
		t.Error("expected isVerbose() to return true")
	}
}
