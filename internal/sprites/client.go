// Package sprites provides a client for the Fly.io Sprites API.
package sprites

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	neturl "net/url"
	"time"
)

const (
	defaultBaseURL = "https://api.sprites.dev"
	defaultTimeout = 30 * time.Second
)

// Client is a Fly.io Sprites API client.
type Client struct {
	baseURL    string
	token      string
	httpClient *http.Client
}

// NewClient creates a new Sprites API client.
func NewClient(token string) *Client {
	return &Client{
		baseURL: defaultBaseURL,
		token:   token,
		httpClient: &http.Client{
			Timeout: defaultTimeout,
		},
	}
}

// WithBaseURL sets a custom base URL (useful for testing).
func (c *Client) WithBaseURL(url string) *Client {
	c.baseURL = url
	return c
}

// WithTimeout sets a custom HTTP timeout.
func (c *Client) WithTimeout(timeout time.Duration) *Client {
	c.httpClient.Timeout = timeout
	return c
}

// Sprite represents a Sprites VM instance.
type Sprite struct {
	Name      string    `json:"name"`
	State     string    `json:"status"`
	CreatedAt time.Time `json:"created_at"`
	Region    string    `json:"region,omitempty"`
}

// CreateSpriteRequest represents a request to create a new sprite.
type CreateSpriteRequest struct {
	Name   string `json:"name"`
	Region string `json:"region,omitempty"`
}

// CreateSpriteResponse represents the response from creating a sprite.
type CreateSpriteResponse struct {
	Sprite Sprite `json:"sprite"`
}

// do executes an HTTP request with authentication.
func (c *Client) do(method, path string, body interface{}) (*http.Response, error) {
	var reqBody io.Reader
	if body != nil {
		jsonBody, err := json.Marshal(body)
		if err != nil {
			return nil, fmt.Errorf("failed to marshal request body: %w", err)
		}
		reqBody = bytes.NewReader(jsonBody)
	}

	req, err := http.NewRequest(method, c.baseURL+path, reqBody)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Authorization", "Bearer "+c.token)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("request failed: %w", err)
	}

	return resp, nil
}

// parseResponse reads and parses a JSON response.
func parseResponse[T any](resp *http.Response) (*T, error) {
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response body: %w", err)
	}

	if resp.StatusCode >= 400 {
		return nil, parseAPIError(resp.StatusCode, body)
	}

	var result T
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("failed to parse response: %w", err)
	}

	return &result, nil
}

// parseAPIError extracts error details from an API error response.
func parseAPIError(statusCode int, body []byte) error {
	var errResp struct {
		Error   string `json:"error"`
		Message string `json:"message"`
	}
	if err := json.Unmarshal(body, &errResp); err != nil {
		return &APIError{
			StatusCode: statusCode,
			Message:    string(body),
		}
	}

	message := errResp.Error
	if message == "" {
		message = errResp.Message
	}
	if message == "" {
		message = string(body)
	}

	return &APIError{
		StatusCode: statusCode,
		Message:    message,
	}
}

// APIError represents an error returned by the Sprites API.
type APIError struct {
	StatusCode int
	Message    string
}

func (e *APIError) Error() string {
	return fmt.Sprintf("sprites API error (%d): %s", e.StatusCode, e.Message)
}

// IsNotFound returns true if the error is a 404 Not Found.
func (e *APIError) IsNotFound() bool {
	return e.StatusCode == http.StatusNotFound
}

// IsQuotaExceeded returns true if the error is a quota exceeded error.
func (e *APIError) IsQuotaExceeded() bool {
	return e.StatusCode == http.StatusTooManyRequests || e.StatusCode == http.StatusForbidden
}

// IsAuthError returns true if the error is an authentication error.
func (e *APIError) IsAuthError() bool {
	return e.StatusCode == http.StatusUnauthorized
}

// CreateSprite creates a new sprite instance.
func (c *Client) CreateSprite(req CreateSpriteRequest) (*Sprite, error) {
	resp, err := c.do(http.MethodPost, "/v1/sprites", req)
	if err != nil {
		return nil, err
	}

	result, err := parseResponse[CreateSpriteResponse](resp)
	if err != nil {
		return nil, err
	}

	return &result.Sprite, nil
}

// GetSprite retrieves a sprite by name.
func (c *Client) GetSprite(name string) (*Sprite, error) {
	resp, err := c.do(http.MethodGet, "/v1/sprites/"+name, nil)
	if err != nil {
		return nil, err
	}

	result, err := parseResponse[Sprite](resp)
	if err != nil {
		return nil, err
	}

	return result, nil
}

// ExecCommand executes a command inside a sprite and returns the output.
func (c *Client) ExecCommand(name string, command string) (string, error) {
	return c.ExecCommandWithEnv(name, command, nil)
}

// ExecCommandWithEnv executes a command with environment variables.
func (c *Client) ExecCommandWithEnv(name string, command string, env map[string]string) (string, error) {
	// Build URL with query parameters
	reqURL := fmt.Sprintf("%s/v1/sprites/%s/exec?cmd=%s", c.baseURL, name, neturl.QueryEscape(command))

	// Add environment variables
	for k, v := range env {
		reqURL += "&env=" + neturl.QueryEscape(k+"="+v)
	}

	req, err := http.NewRequest(http.MethodPost, reqURL, nil)
	if err != nil {
		return "", fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Authorization", "Bearer "+c.token)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("failed to read response: %w", err)
	}

	if resp.StatusCode >= 400 {
		return "", parseAPIError(resp.StatusCode, body)
	}

	// Parse JSON response to extract output field
	var execResp struct {
		Output string `json:"output"`
	}
	if err := json.Unmarshal(body, &execResp); err != nil {
		// If not JSON, return raw body (fallback for plain text responses)
		return string(body), nil
	}

	return execResp.Output, nil
}

// ListSprites returns all sprites for the account.
func (c *Client) ListSprites() ([]Sprite, error) {
	resp, err := c.do(http.MethodGet, "/v1/sprites", nil)
	if err != nil {
		return nil, err
	}

	result, err := parseResponse[struct {
		Sprites []Sprite `json:"sprites"`
	}](resp)
	if err != nil {
		return nil, err
	}

	return result.Sprites, nil
}

// DeleteSprite deletes a sprite by name.
func (c *Client) DeleteSprite(name string) error {
	resp, err := c.do(http.MethodDelete, "/v1/sprites/"+name, nil)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		body, _ := io.ReadAll(resp.Body)
		return parseAPIError(resp.StatusCode, body)
	}

	return nil
}
