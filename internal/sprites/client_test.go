package sprites

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

// TestNewClient_GivenToken_ThenSetsDefaults tests client initialization.
func TestNewClient_GivenToken_ThenSetsDefaults(t *testing.T) {
	client := NewClient("test-token")

	if client.token != "test-token" {
		t.Errorf("token = %q, want %q", client.token, "test-token")
	}
	if client.baseURL != defaultBaseURL {
		t.Errorf("baseURL = %q, want %q", client.baseURL, defaultBaseURL)
	}
	if client.httpClient == nil {
		t.Error("expected httpClient to be initialized")
	}
	if client.httpClient.Timeout != defaultTimeout {
		t.Errorf("timeout = %v, want %v", client.httpClient.Timeout, defaultTimeout)
	}
}

// TestClient_WithBaseURL_GivenURL_ThenSetsURL tests URL override.
func TestClient_WithBaseURL_GivenURL_ThenSetsURL(t *testing.T) {
	client := NewClient("token").WithBaseURL("https://custom.api.com")

	if client.baseURL != "https://custom.api.com" {
		t.Errorf("baseURL = %q, want %q", client.baseURL, "https://custom.api.com")
	}
}

// TestClient_WithTimeout_GivenDuration_ThenSetsTimeout tests timeout override.
func TestClient_WithTimeout_GivenDuration_ThenSetsTimeout(t *testing.T) {
	client := NewClient("token").WithTimeout(60 * time.Second)

	if client.httpClient.Timeout != 60*time.Second {
		t.Errorf("timeout = %v, want %v", client.httpClient.Timeout, 60*time.Second)
	}
}

// TestClient_CreateSprite_GivenValidRequest_ThenReturnsSprite tests sprite creation.
func TestClient_CreateSprite_GivenValidRequest_ThenReturnsSprite(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Verify request
		if r.Method != http.MethodPost {
			t.Errorf("method = %q, want %q", r.Method, http.MethodPost)
		}
		if r.URL.Path != "/v1/sprites" {
			t.Errorf("path = %q, want %q", r.URL.Path, "/v1/sprites")
		}
		if auth := r.Header.Get("Authorization"); auth != "Bearer test-token" {
			t.Errorf("Authorization = %q, want %q", auth, "Bearer test-token")
		}

		// Return response
		resp := CreateSpriteResponse{
			Sprite: Sprite{
				Name:      "sandctl-test1234",
				State:     "running",
				CreatedAt: time.Now(),
				Region:    "iad",
			},
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(resp)
	}))
	defer server.Close()

	client := NewClient("test-token").WithBaseURL(server.URL)

	sprite, err := client.CreateSprite(CreateSpriteRequest{
		Name:   "sandctl-test1234",
		Region: "iad",
	})

	if err != nil {
		t.Fatalf("CreateSprite() error = %v", err)
	}
	if sprite.Name != "sandctl-test1234" {
		t.Errorf("Name = %q, want %q", sprite.Name, "sandctl-test1234")
	}
	if sprite.State != "running" {
		t.Errorf("State = %q, want %q", sprite.State, "running")
	}
}

// TestClient_CreateSprite_GivenAPIError_ThenReturnsError tests error handling.
func TestClient_CreateSprite_GivenAPIError_ThenReturnsError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "invalid request"})
	}))
	defer server.Close()

	client := NewClient("test-token").WithBaseURL(server.URL)

	_, err := client.CreateSprite(CreateSpriteRequest{Name: "test"})

	if err == nil {
		t.Fatal("expected error")
	}

	apiErr, ok := err.(*APIError)
	if !ok {
		t.Fatalf("expected APIError, got %T: %v", err, err)
	}
	if apiErr.StatusCode != http.StatusBadRequest {
		t.Errorf("StatusCode = %d, want %d", apiErr.StatusCode, http.StatusBadRequest)
	}
}

// TestClient_GetSprite_GivenExistingSprite_ThenReturnsSprite tests sprite retrieval.
func TestClient_GetSprite_GivenExistingSprite_ThenReturnsSprite(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			t.Errorf("method = %q, want %q", r.Method, http.MethodGet)
		}
		if r.URL.Path != "/v1/sprites/sandctl-test1234" {
			t.Errorf("path = %q, want %q", r.URL.Path, "/v1/sprites/sandctl-test1234")
		}

		sprite := Sprite{
			Name:      "sandctl-test1234",
			State:     "running",
			CreatedAt: time.Now(),
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(sprite)
	}))
	defer server.Close()

	client := NewClient("test-token").WithBaseURL(server.URL)

	sprite, err := client.GetSprite("sandctl-test1234")

	if err != nil {
		t.Fatalf("GetSprite() error = %v", err)
	}
	if sprite.Name != "sandctl-test1234" {
		t.Errorf("Name = %q, want %q", sprite.Name, "sandctl-test1234")
	}
}

// TestClient_GetSprite_GivenNotFound_ThenReturnsAPIError tests 404 handling.
func TestClient_GetSprite_GivenNotFound_ThenReturnsAPIError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusNotFound)
		json.NewEncoder(w).Encode(map[string]string{"error": "sprite not found"})
	}))
	defer server.Close()

	client := NewClient("test-token").WithBaseURL(server.URL)

	_, err := client.GetSprite("sandctl-notfound")

	if err == nil {
		t.Fatal("expected error")
	}

	apiErr, ok := err.(*APIError)
	if !ok {
		t.Fatalf("expected APIError, got %T: %v", err, err)
	}
	if !apiErr.IsNotFound() {
		t.Error("expected IsNotFound() to return true")
	}
}

// TestClient_ListSprites_GivenSprites_ThenReturnsList tests listing sprites.
func TestClient_ListSprites_GivenSprites_ThenReturnsList(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			t.Errorf("method = %q, want %q", r.Method, http.MethodGet)
		}
		if r.URL.Path != "/v1/sprites" {
			t.Errorf("path = %q, want %q", r.URL.Path, "/v1/sprites")
		}

		resp := struct {
			Sprites []Sprite `json:"sprites"`
		}{
			Sprites: []Sprite{
				{Name: "sprite-1", State: "running"},
				{Name: "sprite-2", State: "stopped"},
			},
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(resp)
	}))
	defer server.Close()

	client := NewClient("test-token").WithBaseURL(server.URL)

	sprites, err := client.ListSprites()

	if err != nil {
		t.Fatalf("ListSprites() error = %v", err)
	}
	if len(sprites) != 2 {
		t.Errorf("expected 2 sprites, got %d", len(sprites))
	}
}

// TestClient_DeleteSprite_GivenExisting_ThenSucceeds tests sprite deletion.
func TestClient_DeleteSprite_GivenExisting_ThenSucceeds(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodDelete {
			t.Errorf("method = %q, want %q", r.Method, http.MethodDelete)
		}
		if r.URL.Path != "/v1/sprites/sandctl-test1234" {
			t.Errorf("path = %q, want %q", r.URL.Path, "/v1/sprites/sandctl-test1234")
		}

		w.WriteHeader(http.StatusNoContent)
	}))
	defer server.Close()

	client := NewClient("test-token").WithBaseURL(server.URL)

	err := client.DeleteSprite("sandctl-test1234")

	if err != nil {
		t.Errorf("DeleteSprite() error = %v", err)
	}
}

// TestClient_DeleteSprite_GivenNotFound_ThenReturnsError tests delete 404.
func TestClient_DeleteSprite_GivenNotFound_ThenReturnsError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusNotFound)
		json.NewEncoder(w).Encode(map[string]string{"error": "not found"})
	}))
	defer server.Close()

	client := NewClient("test-token").WithBaseURL(server.URL)

	err := client.DeleteSprite("sandctl-notfound")

	if err == nil {
		t.Fatal("expected error")
	}
}

// TestClient_ExecCommand_GivenValidCommand_ThenReturnsOutput tests exec.
func TestClient_ExecCommand_GivenValidCommand_ThenReturnsOutput(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			t.Errorf("method = %q, want %q", r.Method, http.MethodPost)
		}
		if r.URL.Path != "/v1/sprites/sandctl-test1234/exec" {
			t.Errorf("path = %q, want %q", r.URL.Path, "/v1/sprites/sandctl-test1234/exec")
		}

		resp := struct {
			Output string `json:"output"`
		}{
			Output: "hello world\n",
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(resp)
	}))
	defer server.Close()

	client := NewClient("test-token").WithBaseURL(server.URL)

	output, err := client.ExecCommand("sandctl-test1234", "echo hello world")

	if err != nil {
		t.Fatalf("ExecCommand() error = %v", err)
	}
	if output != "hello world\n" {
		t.Errorf("output = %q, want %q", output, "hello world\n")
	}
}

// TestAPIError_Error_GivenValues_ThenReturnsFormattedMessage tests error message.
func TestAPIError_Error_GivenValues_ThenReturnsFormattedMessage(t *testing.T) {
	err := &APIError{
		StatusCode: 500,
		Message:    "internal server error",
	}

	expected := "sprites API error (500): internal server error"
	if err.Error() != expected {
		t.Errorf("Error() = %q, want %q", err.Error(), expected)
	}
}

// TestAPIError_IsNotFound_Given404_ThenReturnsTrue tests 404 detection.
func TestAPIError_IsNotFound_Given404_ThenReturnsTrue(t *testing.T) {
	err := &APIError{StatusCode: http.StatusNotFound}

	if !err.IsNotFound() {
		t.Error("expected IsNotFound() to return true")
	}
}

// TestAPIError_IsNotFound_GivenOther_ThenReturnsFalse tests non-404.
func TestAPIError_IsNotFound_GivenOther_ThenReturnsFalse(t *testing.T) {
	err := &APIError{StatusCode: http.StatusBadRequest}

	if err.IsNotFound() {
		t.Error("expected IsNotFound() to return false")
	}
}

// TestAPIError_IsQuotaExceeded_Given429_ThenReturnsTrue tests rate limit detection.
func TestAPIError_IsQuotaExceeded_Given429_ThenReturnsTrue(t *testing.T) {
	err := &APIError{StatusCode: http.StatusTooManyRequests}

	if !err.IsQuotaExceeded() {
		t.Error("expected IsQuotaExceeded() to return true for 429")
	}
}

// TestAPIError_IsQuotaExceeded_Given403_ThenReturnsTrue tests forbidden quota.
func TestAPIError_IsQuotaExceeded_Given403_ThenReturnsTrue(t *testing.T) {
	err := &APIError{StatusCode: http.StatusForbidden}

	if !err.IsQuotaExceeded() {
		t.Error("expected IsQuotaExceeded() to return true for 403")
	}
}

// TestAPIError_IsQuotaExceeded_GivenOther_ThenReturnsFalse tests non-quota error.
func TestAPIError_IsQuotaExceeded_GivenOther_ThenReturnsFalse(t *testing.T) {
	err := &APIError{StatusCode: http.StatusBadRequest}

	if err.IsQuotaExceeded() {
		t.Error("expected IsQuotaExceeded() to return false")
	}
}

// TestAPIError_IsAuthError_Given401_ThenReturnsTrue tests auth error detection.
func TestAPIError_IsAuthError_Given401_ThenReturnsTrue(t *testing.T) {
	err := &APIError{StatusCode: http.StatusUnauthorized}

	if !err.IsAuthError() {
		t.Error("expected IsAuthError() to return true")
	}
}

// TestAPIError_IsAuthError_GivenOther_ThenReturnsFalse tests non-auth error.
func TestAPIError_IsAuthError_GivenOther_ThenReturnsFalse(t *testing.T) {
	err := &APIError{StatusCode: http.StatusBadRequest}

	if err.IsAuthError() {
		t.Error("expected IsAuthError() to return false")
	}
}

// TestParseAPIError_GivenErrorField_ThenUsesErrorMessage tests error parsing.
func TestParseAPIError_GivenErrorField_ThenUsesErrorMessage(t *testing.T) {
	body := []byte(`{"error": "error message"}`)

	err := parseAPIError(400, body)

	apiErr, ok := err.(*APIError)
	if !ok {
		t.Fatalf("expected APIError, got %T", err)
	}
	if apiErr.Message != "error message" {
		t.Errorf("Message = %q, want %q", apiErr.Message, "error message")
	}
}

// TestParseAPIError_GivenMessageField_ThenUsesMessage tests message field.
func TestParseAPIError_GivenMessageField_ThenUsesMessage(t *testing.T) {
	body := []byte(`{"message": "message field"}`)

	err := parseAPIError(400, body)

	apiErr, ok := err.(*APIError)
	if !ok {
		t.Fatalf("expected APIError, got %T", err)
	}
	if apiErr.Message != "message field" {
		t.Errorf("Message = %q, want %q", apiErr.Message, "message field")
	}
}

// TestParseAPIError_GivenInvalidJSON_ThenUsesBodyAsMessage tests fallback.
func TestParseAPIError_GivenInvalidJSON_ThenUsesBodyAsMessage(t *testing.T) {
	body := []byte(`plain text error`)

	err := parseAPIError(500, body)

	apiErr, ok := err.(*APIError)
	if !ok {
		t.Fatalf("expected APIError, got %T", err)
	}
	if apiErr.Message != "plain text error" {
		t.Errorf("Message = %q, want %q", apiErr.Message, "plain text error")
	}
}
