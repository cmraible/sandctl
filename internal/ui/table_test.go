package ui

import (
	"bytes"
	"strings"
	"testing"
)

// TestNewTable_GivenHeaders_ThenCreatesTable tests table creation.
func TestNewTable_GivenHeaders_ThenCreatesTable(t *testing.T) {
	table := NewTable("ID", "NAME", "STATUS")

	if table == nil {
		t.Fatal("expected non-nil table")
	}
	if len(table.headers) != 3 {
		t.Errorf("expected 3 headers, got %d", len(table.headers))
	}
	if table.headers[0] != "ID" {
		t.Errorf("header[0] = %q, want %q", table.headers[0], "ID")
	}
}

// TestNewTable_GivenNoHeaders_ThenCreatesEmptyTable tests empty table.
func TestNewTable_GivenNoHeaders_ThenCreatesEmptyTable(t *testing.T) {
	table := NewTable()

	if table == nil {
		t.Fatal("expected non-nil table")
	}
	if len(table.headers) != 0 {
		t.Errorf("expected 0 headers, got %d", len(table.headers))
	}
}

// TestTable_AddRow_GivenValues_ThenAddsRow tests adding rows.
func TestTable_AddRow_GivenValues_ThenAddsRow(t *testing.T) {
	table := NewTable("ID", "NAME")
	table.AddRow("1", "Alice")
	table.AddRow("2", "Bob")

	if len(table.rows) != 2 {
		t.Errorf("expected 2 rows, got %d", len(table.rows))
	}
	if table.rows[0][0] != "1" {
		t.Errorf("row[0][0] = %q, want %q", table.rows[0][0], "1")
	}
	if table.rows[0][1] != "Alice" {
		t.Errorf("row[0][1] = %q, want %q", table.rows[0][1], "Alice")
	}
}

// TestTable_AddRow_GivenTooFewValues_ThenPadsWithEmpty tests underflow handling.
func TestTable_AddRow_GivenTooFewValues_ThenPadsWithEmpty(t *testing.T) {
	table := NewTable("ID", "NAME", "STATUS")
	table.AddRow("1")

	if len(table.rows) != 1 {
		t.Errorf("expected 1 row, got %d", len(table.rows))
	}
	if len(table.rows[0]) != 3 {
		t.Errorf("expected 3 columns, got %d", len(table.rows[0]))
	}
	if table.rows[0][1] != "" {
		t.Errorf("row[0][1] = %q, want empty", table.rows[0][1])
	}
	if table.rows[0][2] != "" {
		t.Errorf("row[0][2] = %q, want empty", table.rows[0][2])
	}
}

// TestTable_AddRow_GivenTooManyValues_ThenTruncates tests overflow handling.
func TestTable_AddRow_GivenTooManyValues_ThenTruncates(t *testing.T) {
	table := NewTable("ID", "NAME")
	table.AddRow("1", "Alice", "extra", "values")

	if len(table.rows) != 1 {
		t.Errorf("expected 1 row, got %d", len(table.rows))
	}
	if len(table.rows[0]) != 2 {
		t.Errorf("expected 2 columns, got %d", len(table.rows[0]))
	}
}

// TestTable_AddRow_GivenLongValue_ThenUpdatesWidth tests width calculation.
func TestTable_AddRow_GivenLongValue_ThenUpdatesWidth(t *testing.T) {
	table := NewTable("ID", "NAME")
	table.AddRow("123456", "Short")

	// Width should be updated to accommodate "123456"
	if table.widths[0] < 6 {
		t.Errorf("width[0] = %d, expected at least 6", table.widths[0])
	}
}

// TestTable_Render_GivenData_ThenWritesFormattedTable tests rendering.
func TestTable_Render_GivenData_ThenWritesFormattedTable(t *testing.T) {
	table := NewTable("ID", "NAME", "STATUS")
	table.AddRow("1", "Alice", "active")
	table.AddRow("2", "Bob", "inactive")

	var buf bytes.Buffer
	table.Render(&buf)

	output := buf.String()
	lines := strings.Split(strings.TrimSpace(output), "\n")

	if len(lines) != 3 {
		t.Errorf("expected 3 lines (header + 2 rows), got %d", len(lines))
	}

	// Header should be first line
	if !strings.Contains(lines[0], "ID") {
		t.Error("header should contain 'ID'")
	}
	if !strings.Contains(lines[0], "NAME") {
		t.Error("header should contain 'NAME'")
	}

	// Rows should follow
	if !strings.Contains(lines[1], "Alice") {
		t.Error("first row should contain 'Alice'")
	}
	if !strings.Contains(lines[2], "Bob") {
		t.Error("second row should contain 'Bob'")
	}
}

// TestTable_Render_GivenEmpty_ThenWritesOnlyHeaders tests empty table rendering.
func TestTable_Render_GivenEmpty_ThenWritesOnlyHeaders(t *testing.T) {
	table := NewTable("ID", "NAME")

	var buf bytes.Buffer
	table.Render(&buf)

	output := buf.String()
	lines := strings.Split(strings.TrimSpace(output), "\n")

	if len(lines) != 1 {
		t.Errorf("expected 1 line (header only), got %d", len(lines))
	}
}

// TestTable_Render_GivenColumns_ThenAligns tests column alignment.
func TestTable_Render_GivenColumns_ThenAligns(t *testing.T) {
	table := NewTable("ID", "NAME")
	table.AddRow("1", "Alice")
	table.AddRow("12", "Bob")

	var buf bytes.Buffer
	table.Render(&buf)

	output := buf.String()
	lines := strings.Split(strings.TrimSpace(output), "\n")

	// Both data rows should have the same column positions
	// because columns are padded to the same width
	aliceIdx := strings.Index(lines[1], "Alice")
	bobIdx := strings.Index(lines[2], "Bob")

	if aliceIdx != bobIdx {
		t.Errorf("column alignment mismatch: Alice at %d, Bob at %d", aliceIdx, bobIdx)
	}
}

// TestTable_String_GivenData_ThenReturnsStringRepresentation tests String method.
func TestTable_String_GivenData_ThenReturnsStringRepresentation(t *testing.T) {
	table := NewTable("COL1", "COL2")
	table.AddRow("A", "B")

	result := table.String()

	if result == "" {
		t.Error("expected non-empty string")
	}
	if !strings.Contains(result, "COL1") {
		t.Error("string should contain header")
	}
	if !strings.Contains(result, "A") {
		t.Error("string should contain row data")
	}
}

// TestTable_Render_GivenColumnSeparator_ThenUsesTwoSpaces tests separator.
func TestTable_Render_GivenColumnSeparator_ThenUsesTwoSpaces(t *testing.T) {
	table := NewTable("A", "B")
	table.AddRow("1", "2")

	var buf bytes.Buffer
	table.Render(&buf)

	output := buf.String()

	// Columns should be separated by two spaces
	if !strings.Contains(output, "  ") {
		t.Error("columns should be separated by at least two spaces")
	}
}

// TestTable_Widths_GivenInitialization_ThenMatchesHeaderLengths tests initial widths.
func TestTable_Widths_GivenInitialization_ThenMatchesHeaderLengths(t *testing.T) {
	table := NewTable("SHORT", "LONGHEADER", "MED")

	expected := []int{5, 10, 3}
	for i, w := range expected {
		if table.widths[i] != w {
			t.Errorf("widths[%d] = %d, want %d", i, table.widths[i], w)
		}
	}
}

// TestTable_Render_GivenUnicodeContent_ThenHandlesCorrectly tests unicode handling.
func TestTable_Render_GivenUnicodeContent_ThenHandlesCorrectly(t *testing.T) {
	table := NewTable("NAME", "STATUS")
	table.AddRow("テスト", "✓ running")

	var buf bytes.Buffer
	table.Render(&buf)

	output := buf.String()
	if !strings.Contains(output, "テスト") {
		t.Error("should contain unicode content")
	}
	if !strings.Contains(output, "✓ running") {
		t.Error("should contain emoji/symbol")
	}
}
