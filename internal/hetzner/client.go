// Package hetzner implements the Hetzner Cloud VM provider.
package hetzner

import (
	"context"
	"fmt"

	"github.com/hetznercloud/hcloud-go/v2/hcloud"

	"github.com/sandctl/sandctl/internal/config"
)

// Client wraps the Hetzner Cloud SDK client.
type Client struct {
	hc     *hcloud.Client
	config *config.ProviderConfig
}

// NewClient creates a new Hetzner Cloud client from configuration.
func NewClient(cfg *config.ProviderConfig) *Client {
	hc := hcloud.NewClient(hcloud.WithToken(cfg.Token))
	return &Client{
		hc:     hc,
		config: cfg,
	}
}

// HCloudClient returns the underlying hcloud client for direct API access.
func (c *Client) HCloudClient() *hcloud.Client {
	return c.hc
}

// ValidateCredentials checks if the API token is valid.
func (c *Client) ValidateCredentials(ctx context.Context) error {
	// Try to list datacenters as a simple credential check
	_, err := c.hc.Datacenter.All(ctx)
	if err != nil {
		return fmt.Errorf("invalid Hetzner credentials: %w", err)
	}
	return nil
}

// GetDefaultRegion returns the configured region or the default.
func (c *Client) GetDefaultRegion() string {
	if c.config.Region != "" {
		return c.config.Region
	}
	return DefaultRegion
}

// GetDefaultServerType returns the configured server type or the default.
func (c *Client) GetDefaultServerType() string {
	if c.config.ServerType != "" {
		return c.config.ServerType
	}
	return DefaultServerType
}

// GetDefaultImage returns the configured image or the default.
func (c *Client) GetDefaultImage() string {
	if c.config.Image != "" {
		return c.config.Image
	}
	return DefaultImage
}
