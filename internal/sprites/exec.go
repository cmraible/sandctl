package sprites

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"sync"

	"github.com/gorilla/websocket"
)

// wsMessage represents a WebSocket message from the Sprites API.
type wsMessage struct {
	Type string `json:"type"`
}

// ExecOptions configures an exec session.
type ExecOptions struct {
	Command     string
	Interactive bool
	Stdin       io.Reader
	Stdout      io.Writer
	Stderr      io.Writer
}

// ExecSession represents an active exec session.
type ExecSession struct {
	conn      *websocket.Conn
	opts      ExecOptions
	done      chan struct{}
	cancel    context.CancelFunc
	closeOnce sync.Once
}

// ExecWebSocket opens a WebSocket connection for command execution.
func (c *Client) ExecWebSocket(ctx context.Context, spriteName string, opts ExecOptions) (*ExecSession, error) {
	// Build WebSocket URL
	baseURL := strings.Replace(c.baseURL, "https://", "wss://", 1)
	baseURL = strings.Replace(baseURL, "http://", "ws://", 1)

	wsURL, err := url.Parse(fmt.Sprintf("%s/v1/sprites/%s/exec", baseURL, spriteName))
	if err != nil {
		return nil, fmt.Errorf("failed to parse WebSocket URL: %w", err)
	}

	// Add query parameters
	q := wsURL.Query()
	if opts.Command != "" {
		q.Set("cmd", opts.Command)
	} else if opts.Interactive {
		// Default to bash for interactive sessions
		q.Set("cmd", "bash")
	}
	if opts.Interactive {
		q.Set("tty", "true")
		q.Set("stdin", "true")
		// Set default terminal size
		q.Set("cols", "120")
		q.Set("rows", "40")
	}
	wsURL.RawQuery = q.Encode()

	// Create WebSocket connection
	header := http.Header{}
	header.Set("Authorization", "Bearer "+c.token)

	dialer := websocket.DefaultDialer
	conn, resp, err := dialer.DialContext(ctx, wsURL.String(), header)
	if err != nil {
		if resp != nil && resp.StatusCode >= 400 {
			return nil, &APIError{
				StatusCode: resp.StatusCode,
				Message:    fmt.Sprintf("WebSocket connection failed: %v", err),
			}
		}
		return nil, fmt.Errorf("failed to connect: %w", err)
	}

	_, cancel := context.WithCancel(ctx)
	session := &ExecSession{
		conn:   conn,
		opts:   opts,
		done:   make(chan struct{}),
		cancel: cancel,
	}

	return session, nil
}

// Run starts the exec session and blocks until completion.
func (s *ExecSession) Run() error {
	defer s.Close()

	errChan := make(chan error, 2)

	// Read from WebSocket and write to stdout
	go func() {
		firstMessage := true
		for {
			_, message, err := s.conn.ReadMessage()
			if err != nil {
				if websocket.IsCloseError(err, websocket.CloseNormalClosure) {
					errChan <- nil
					return
				}
				errChan <- err
				return
			}
			// Check if this is a JSON control message
			if len(message) > 0 && message[0] == '{' {
				var msg wsMessage
				if json.Unmarshal(message, &msg) == nil && msg.Type != "" {
					// Skip control messages (session_info, exit, port_notification, etc.)
					// Clear the line if this was the first message to reset cursor position
					if firstMessage && s.opts.Stdout != nil {
						_, _ = s.opts.Stdout.Write([]byte("\r\033[K"))
					}
					firstMessage = false
					continue
				}
			}
			firstMessage = false
			if s.opts.Stdout != nil {
				_, _ = s.opts.Stdout.Write(message)
			}
		}
	}()

	// Read from stdin and write to WebSocket (if interactive)
	if s.opts.Interactive && s.opts.Stdin != nil {
		go func() {
			buf := make([]byte, 1024)
			for {
				n, err := s.opts.Stdin.Read(buf)
				if err != nil {
					if err == io.EOF {
						// Send close message
						_ = s.conn.WriteMessage(websocket.CloseMessage,
							websocket.FormatCloseMessage(websocket.CloseNormalClosure, ""))
						errChan <- nil
						return
					}
					errChan <- err
					return
				}
				if err := s.conn.WriteMessage(websocket.BinaryMessage, buf[:n]); err != nil {
					errChan <- err
					return
				}
			}
		}()
	}

	// Wait for completion
	select {
	case err := <-errChan:
		return err
	case <-s.done:
		return nil
	}
}

// Close closes the exec session.
func (s *ExecSession) Close() error {
	var err error
	s.closeOnce.Do(func() {
		s.cancel()
		close(s.done)
		err = s.conn.Close()
	})
	return err
}
