package hetzner

import (
	"context"
	"errors"
	"fmt"
	"strconv"
	"time"

	"github.com/hetznercloud/hcloud-go/v2/hcloud"

	"github.com/sandctl/sandctl/internal/config"
	"github.com/sandctl/sandctl/internal/provider"
	"github.com/sandctl/sandctl/internal/sshexec"
)

const (
	providerName = "hetzner"

	// Polling intervals for WaitReady
	pollInterval    = 5 * time.Second
	sshCheckTimeout = 5 * time.Second
)

// Provider implements the provider.Provider interface for Hetzner Cloud.
type Provider struct {
	client *Client
	config *config.ProviderConfig
}

// NewProvider creates a new Hetzner provider from configuration.
func NewProvider(cfg *config.Config) (provider.Provider, error) {
	provCfg, ok := cfg.GetProviderConfig(providerName)
	if !ok {
		return nil, fmt.Errorf("hetzner provider not configured")
	}

	return &Provider{
		client: NewClient(provCfg),
		config: provCfg,
	}, nil
}

// Name returns the provider identifier.
func (p *Provider) Name() string {
	return providerName
}

// Create provisions a new VM with the given options.
func (p *Provider) Create(ctx context.Context, opts provider.CreateOpts) (*provider.VM, error) {
	// Determine region, server type, and image
	region := opts.Region
	if region == "" {
		region = p.client.GetDefaultRegion()
	}

	serverType := opts.ServerType
	if serverType == "" {
		serverType = p.client.GetDefaultServerType()
	}

	image := opts.Image
	if image == "" {
		image = p.client.GetDefaultImage()
	}

	// Get SSH key
	sshKeyID, err := strconv.ParseInt(opts.SSHKeyID, 10, 64)
	if err != nil {
		return nil, fmt.Errorf("invalid SSH key ID: %w", err)
	}

	sshKey, err := p.client.GetSSHKeyByID(ctx, sshKeyID)
	if err != nil {
		return nil, fmt.Errorf("failed to get SSH key: %w", err)
	}

	// Use cloud-init script
	userData := opts.UserData
	if userData == "" {
		userData = CloudInitScript()
	}

	// Create server options
	createOpts := hcloud.ServerCreateOpts{
		Name:       opts.Name,
		ServerType: &hcloud.ServerType{Name: serverType},
		Image:      &hcloud.Image{Name: image},
		Location:   &hcloud.Location{Name: region},
		SSHKeys:    []*hcloud.SSHKey{sshKey},
		UserData:   userData,
		Labels: map[string]string{
			"managed-by": "sandctl",
		},
	}

	// Create server
	result, _, err := p.client.HCloudClient().Server.Create(ctx, createOpts)
	if err != nil {
		if isQuotaError(err) {
			return nil, fmt.Errorf("%w: %v", provider.ErrQuotaExceeded, err)
		}
		if isAuthError(err) {
			return nil, fmt.Errorf("%w: %v", provider.ErrAuthFailed, err)
		}
		return nil, fmt.Errorf("%w: %v", provider.ErrProvisionFailed, err)
	}

	server := result.Server

	// Get IP address
	ipAddress := ""
	if server.PublicNet.IPv4.IP != nil {
		ipAddress = server.PublicNet.IPv4.IP.String()
	}

	return &provider.VM{
		ID:         fmt.Sprintf("%d", server.ID),
		Name:       server.Name,
		Status:     mapServerStatus(server.Status),
		IPAddress:  ipAddress,
		CreatedAt:  server.Created,
		Region:     region,
		ServerType: serverType,
	}, nil
}

// Get retrieves a VM by its provider-specific ID.
func (p *Provider) Get(ctx context.Context, id string) (*provider.VM, error) {
	serverID, err := strconv.ParseInt(id, 10, 64)
	if err != nil {
		return nil, fmt.Errorf("invalid server ID: %w", err)
	}

	server, _, err := p.client.HCloudClient().Server.GetByID(ctx, serverID)
	if err != nil {
		return nil, fmt.Errorf("failed to get server: %w", err)
	}

	if server == nil {
		return nil, provider.ErrNotFound
	}

	ipAddress := ""
	if server.PublicNet.IPv4.IP != nil {
		ipAddress = server.PublicNet.IPv4.IP.String()
	}

	return &provider.VM{
		ID:         fmt.Sprintf("%d", server.ID),
		Name:       server.Name,
		Status:     mapServerStatus(server.Status),
		IPAddress:  ipAddress,
		CreatedAt:  server.Created,
		Region:     server.Location.Name,
		ServerType: server.ServerType.Name,
	}, nil
}

// Delete terminates and removes a VM.
func (p *Provider) Delete(ctx context.Context, id string) error {
	serverID, err := strconv.ParseInt(id, 10, 64)
	if err != nil {
		return fmt.Errorf("invalid server ID: %w", err)
	}

	server, _, err := p.client.HCloudClient().Server.GetByID(ctx, serverID)
	if err != nil {
		return fmt.Errorf("failed to get server: %w", err)
	}

	if server == nil {
		// Already deleted, idempotent success
		return nil
	}

	_, _, err = p.client.HCloudClient().Server.DeleteWithResult(ctx, server)
	if err != nil {
		return fmt.Errorf("failed to delete server: %w", err)
	}

	return nil
}

// List returns all VMs managed by this provider.
func (p *Provider) List(ctx context.Context) ([]*provider.VM, error) {
	opts := hcloud.ServerListOpts{
		ListOpts: hcloud.ListOpts{
			LabelSelector: "managed-by=sandctl",
		},
	}

	servers, err := p.client.HCloudClient().Server.AllWithOpts(ctx, opts)
	if err != nil {
		return nil, fmt.Errorf("failed to list servers: %w", err)
	}

	vms := make([]*provider.VM, 0, len(servers))
	for _, server := range servers {
		ipAddress := ""
		if server.PublicNet.IPv4.IP != nil {
			ipAddress = server.PublicNet.IPv4.IP.String()
		}

		vms = append(vms, &provider.VM{
			ID:         fmt.Sprintf("%d", server.ID),
			Name:       server.Name,
			Status:     mapServerStatus(server.Status),
			IPAddress:  ipAddress,
			CreatedAt:  server.Created,
			Region:     server.Location.Name,
			ServerType: server.ServerType.Name,
		})
	}

	return vms, nil
}

// WaitReady blocks until the VM is ready for SSH access.
func (p *Provider) WaitReady(ctx context.Context, id string, timeout time.Duration) error {
	deadline := time.Now().Add(timeout)

	for {
		// Check context cancellation
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
		}

		// Check timeout
		if time.Now().After(deadline) {
			return provider.ErrTimeout
		}

		// Get current VM state
		vm, err := p.Get(ctx, id)
		if err != nil {
			if errors.Is(err, provider.ErrNotFound) {
				return provider.ErrProvisionFailed
			}
			// Transient error, retry
			time.Sleep(pollInterval)
			continue
		}

		// Check for failed state
		if vm.Status == provider.StatusFailed {
			return provider.ErrProvisionFailed
		}

		// Check if running and SSH is available
		if vm.Status == provider.StatusRunning && vm.IPAddress != "" {
			// Try SSH connection
			if sshexec.CheckConnection(vm.IPAddress, 22, sshCheckTimeout) {
				return nil
			}
		}

		time.Sleep(pollInterval)
	}
}

// EnsureSSHKey implements provider.SSHKeyManager.
func (p *Provider) EnsureSSHKey(ctx context.Context, name, publicKey string) (string, error) {
	return p.client.EnsureSSHKey(ctx, name, publicKey)
}

// mapServerStatus converts Hetzner server status to provider.VMStatus.
func mapServerStatus(status hcloud.ServerStatus) provider.VMStatus {
	switch status {
	case hcloud.ServerStatusInitializing:
		return provider.StatusProvisioning
	case hcloud.ServerStatusStarting:
		return provider.StatusStarting
	case hcloud.ServerStatusRunning:
		return provider.StatusRunning
	case hcloud.ServerStatusStopping:
		return provider.StatusStopping
	case hcloud.ServerStatusOff:
		return provider.StatusStopped
	case hcloud.ServerStatusDeleting:
		return provider.StatusDeleting
	default:
		return provider.StatusFailed
	}
}

// isQuotaError checks if the error is a quota exceeded error.
func isQuotaError(err error) bool {
	var hcloudErr hcloud.Error
	if errors.As(err, &hcloudErr) {
		return hcloudErr.Code == hcloud.ErrorCodeResourceLimitExceeded
	}
	return false
}

// isAuthError checks if the error is an authentication error.
func isAuthError(err error) bool {
	var hcloudErr hcloud.Error
	if errors.As(err, &hcloudErr) {
		return hcloudErr.Code == hcloud.ErrorCodeUnauthorized
	}
	return false
}

// init registers the Hetzner provider.
func init() {
	provider.Register(providerName, NewProvider)
}
