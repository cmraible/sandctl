package sprites

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"

	"github.com/gorilla/websocket"
)

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
	conn   *websocket.Conn
	opts   ExecOptions
	done   chan struct{}
	cancel context.CancelFunc
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
	}
	if opts.Interactive {
		q.Set("stdin", "true")
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

	ctx, cancel := context.WithCancel(ctx)
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
				if err := s.conn.WriteMessage(websocket.TextMessage, buf[:n]); err != nil {
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
	s.cancel()
	close(s.done)
	return s.conn.Close()
}
