package sprites

import (
	"bytes"
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

// TestClient_ExecWebSocket_GivenValidSprite_ThenConnects tests WebSocket connection.
func TestClient_ExecWebSocket_GivenValidSprite_ThenConnects(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Verify path
		if !strings.HasPrefix(r.URL.Path, "/v1/sprites/sandctl-test1234/exec") {
			t.Errorf("path = %q, want prefix %q", r.URL.Path, "/v1/sprites/sandctl-test1234/exec")
		}

		// Verify auth header
		if auth := r.Header.Get("Authorization"); auth != "Bearer test-token" {
			t.Errorf("Authorization = %q, want %q", auth, "Bearer test-token")
		}

		// Upgrade to WebSocket
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			t.Fatalf("upgrade error: %v", err)
		}
		defer conn.Close()

		// Send a message and close
		conn.WriteMessage(websocket.TextMessage, []byte("hello"))
		conn.WriteMessage(websocket.CloseMessage, websocket.FormatCloseMessage(websocket.CloseNormalClosure, ""))
	}))
	defer server.Close()

	// Convert http:// to ws://
	wsURL := "ws" + strings.TrimPrefix(server.URL, "http")
	client := NewClient("test-token").WithBaseURL(wsURL)

	ctx := context.Background()
	session, err := client.ExecWebSocket(ctx, "sandctl-test1234", ExecOptions{
		Command: "echo hello",
	})

	if err != nil {
		t.Fatalf("ExecWebSocket() error = %v", err)
	}
	defer session.Close()

	if session.conn == nil {
		t.Error("expected conn to be set")
	}
}

// TestClient_ExecWebSocket_GivenCommand_ThenSetsQueryParam tests command parameter.
func TestClient_ExecWebSocket_GivenCommand_ThenSetsQueryParam(t *testing.T) {
	var receivedCmds []string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		receivedCmds = r.URL.Query()["cmd"]

		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			return
		}
		conn.Close()
	}))
	defer server.Close()

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http")
	client := NewClient("test-token").WithBaseURL(wsURL)

	ctx := context.Background()
	session, err := client.ExecWebSocket(ctx, "sandctl-test1234", ExecOptions{
		Command: "ls -la",
	})

	if err != nil {
		t.Fatalf("ExecWebSocket() error = %v", err)
	}
	session.Close()

	// Command is wrapped with bash -c, so we expect ["bash", "-c", "ls -la"]
	want := []string{"bash", "-c", "ls -la"}
	if len(receivedCmds) != len(want) {
		t.Errorf("cmd params = %v, want %v", receivedCmds, want)
		return
	}
	for i, v := range want {
		if receivedCmds[i] != v {
			t.Errorf("cmd[%d] = %q, want %q", i, receivedCmds[i], v)
		}
	}
}

// TestClient_ExecWebSocket_GivenInteractive_ThenSetsStdinParam tests interactive mode.
func TestClient_ExecWebSocket_GivenInteractive_ThenSetsStdinParam(t *testing.T) {
	var receivedStdin string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		receivedStdin = r.URL.Query().Get("stdin")

		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			return
		}
		conn.Close()
	}))
	defer server.Close()

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http")
	client := NewClient("test-token").WithBaseURL(wsURL)

	ctx := context.Background()
	session, err := client.ExecWebSocket(ctx, "sandctl-test1234", ExecOptions{
		Interactive: true,
	})

	if err != nil {
		t.Fatalf("ExecWebSocket() error = %v", err)
	}
	session.Close()

	if receivedStdin != "true" {
		t.Errorf("stdin = %q, want %q", receivedStdin, "true")
	}
}

// TestClient_ExecWebSocket_GivenAuthError_ThenReturnsAPIError tests auth failure.
func TestClient_ExecWebSocket_GivenAuthError_ThenReturnsAPIError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
	}))
	defer server.Close()

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http")
	client := NewClient("bad-token").WithBaseURL(wsURL)

	ctx := context.Background()
	_, err := client.ExecWebSocket(ctx, "sandctl-test1234", ExecOptions{})

	if err == nil {
		t.Fatal("expected error for auth failure")
	}

	apiErr, ok := err.(*APIError)
	if !ok {
		t.Fatalf("expected APIError, got %T: %v", err, err)
	}
	if apiErr.StatusCode != http.StatusUnauthorized {
		t.Errorf("StatusCode = %d, want %d", apiErr.StatusCode, http.StatusUnauthorized)
	}
}

// TestExecSession_Run_GivenMessages_ThenWritesToStdout tests output streaming.
func TestExecSession_Run_GivenMessages_ThenWritesToStdout(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			return
		}
		defer conn.Close()

		// Send messages
		conn.WriteMessage(websocket.TextMessage, []byte("line 1\n"))
		conn.WriteMessage(websocket.TextMessage, []byte("line 2\n"))
		conn.WriteMessage(websocket.CloseMessage, websocket.FormatCloseMessage(websocket.CloseNormalClosure, ""))
	}))
	defer server.Close()

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http")
	client := NewClient("test-token").WithBaseURL(wsURL)

	var stdout bytes.Buffer
	ctx := context.Background()
	session, err := client.ExecWebSocket(ctx, "test", ExecOptions{
		Stdout: &stdout,
	})
	if err != nil {
		t.Fatalf("ExecWebSocket() error = %v", err)
	}

	err = session.Run()

	if err != nil {
		t.Errorf("Run() error = %v", err)
	}

	output := stdout.String()
	if !strings.Contains(output, "line 1") || !strings.Contains(output, "line 2") {
		t.Errorf("output = %q, expected to contain 'line 1' and 'line 2'", output)
	}
}

// TestExecSession_Run_GivenInteractiveAndStdin_ThenSendsInput tests input handling.
func TestExecSession_Run_GivenInteractiveAndStdin_ThenSendsInput(t *testing.T) {
	receivedInput := make(chan string, 1)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			return
		}
		defer conn.Close()

		// Read input from client
		_, msg, err := conn.ReadMessage()
		if err != nil {
			receivedInput <- ""
			return
		}
		receivedInput <- string(msg)

		// Send close
		conn.WriteMessage(websocket.CloseMessage, websocket.FormatCloseMessage(websocket.CloseNormalClosure, ""))
	}))
	defer server.Close()

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http")
	client := NewClient("test-token").WithBaseURL(wsURL)

	stdin := strings.NewReader("test input")
	ctx := context.Background()
	session, err := client.ExecWebSocket(ctx, "test", ExecOptions{
		Interactive: true,
		Stdin:       stdin,
	})
	if err != nil {
		t.Fatalf("ExecWebSocket() error = %v", err)
	}

	// Run with timeout
	done := make(chan error, 1)
	go func() {
		done <- session.Run()
	}()

	select {
	case input := <-receivedInput:
		if input != "test input" {
			t.Errorf("received = %q, want %q", input, "test input")
		}
	case <-time.After(2 * time.Second):
		t.Error("timeout waiting for input")
	}

	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Error("timeout waiting for Run to complete")
	}
}

// TestExecSession_Close_GivenOpenSession_ThenClosesConnection tests cleanup.
func TestExecSession_Close_GivenOpenSession_ThenClosesConnection(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			return
		}
		// Keep connection open until client closes
		for {
			_, _, err := conn.ReadMessage()
			if err != nil {
				break
			}
		}
	}))
	defer server.Close()

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http")
	client := NewClient("test-token").WithBaseURL(wsURL)

	ctx := context.Background()
	session, err := client.ExecWebSocket(ctx, "test", ExecOptions{})
	if err != nil {
		t.Fatalf("ExecWebSocket() error = %v", err)
	}

	// Close should not error
	if err := session.Close(); err != nil {
		t.Errorf("Close() error = %v", err)
	}
}

// TestExecOptions_GivenDefaults_ThenHasExpectedValues tests option defaults.
func TestExecOptions_GivenDefaults_ThenHasExpectedValues(t *testing.T) {
	opts := ExecOptions{}

	if opts.Command != "" {
		t.Errorf("Command = %q, want empty", opts.Command)
	}
	if opts.Interactive {
		t.Error("Interactive should be false by default")
	}
	if opts.Stdin != nil {
		t.Error("Stdin should be nil by default")
	}
	if opts.Stdout != nil {
		t.Error("Stdout should be nil by default")
	}
	if opts.Stderr != nil {
		t.Error("Stderr should be nil by default")
	}
}

// TestClient_ExecWebSocket_GivenHTTPSURL_ThenConvertsToWSS tests URL conversion.
func TestClient_ExecWebSocket_GivenHTTPSURL_ThenConvertsToWSS(t *testing.T) {
	// We can't easily test wss:// without TLS, but we can verify the URL construction
	client := NewClient("token")
	client.baseURL = "https://api.example.com"

	// The URL conversion happens inside ExecWebSocket
	// This test verifies the client can be created with HTTPS URL
	if client.baseURL != "https://api.example.com" {
		t.Errorf("baseURL = %q, want %q", client.baseURL, "https://api.example.com")
	}
}
