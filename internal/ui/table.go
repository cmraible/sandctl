package ui

import (
	"fmt"
	"io"
	"strings"
)

// Table represents a formatted text table.
type Table struct {
	headers []string
	rows    [][]string
	widths  []int
}

// NewTable creates a new table with the given headers.
func NewTable(headers ...string) *Table {
	widths := make([]int, len(headers))
	for i, h := range headers {
		widths[i] = len(h)
	}
	return &Table{
		headers: headers,
		rows:    [][]string{},
		widths:  widths,
	}
}

// AddRow adds a row to the table.
func (t *Table) AddRow(values ...string) {
	// Ensure row has correct number of columns
	row := make([]string, len(t.headers))
	for i := 0; i < len(t.headers) && i < len(values); i++ {
		row[i] = values[i]
		if len(values[i]) > t.widths[i] {
			t.widths[i] = len(values[i])
		}
	}
	t.rows = append(t.rows, row)
}

// Render writes the table to the given writer.
func (t *Table) Render(w io.Writer) {
	// Print header
	t.printRow(w, t.headers)

	// Print rows
	for _, row := range t.rows {
		t.printRow(w, row)
	}
}

// printRow prints a single row.
func (t *Table) printRow(w io.Writer, values []string) {
	parts := make([]string, len(values))
	for i, v := range values {
		format := fmt.Sprintf("%%-%ds", t.widths[i])
		parts[i] = fmt.Sprintf(format, v)
	}
	fmt.Fprintln(w, strings.Join(parts, "  "))
}

// String returns the table as a string.
func (t *Table) String() string {
	var sb strings.Builder
	t.Render(&sb)
	return sb.String()
}
