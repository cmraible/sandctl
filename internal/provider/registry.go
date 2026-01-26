package provider

import (
	"fmt"

	"github.com/sandctl/sandctl/internal/config"
)

// Factory creates a provider instance from configuration.
type Factory func(cfg *config.Config) (Provider, error)

// providers maps provider names to their factory functions.
var providers = map[string]Factory{}

// Register adds a provider factory to the registry.
// This should be called from init() in each provider package.
func Register(name string, factory Factory) {
	providers[name] = factory
}

// Get returns a provider instance by name.
// Returns an error if the provider is not registered or configuration is invalid.
func Get(name string, cfg *config.Config) (Provider, error) {
	factory, ok := providers[name]
	if !ok {
		return nil, fmt.Errorf("unknown provider: %s", name)
	}
	return factory(cfg)
}

// Available returns a list of registered provider names.
func Available() []string {
	names := make([]string, 0, len(providers))
	for name := range providers {
		names = append(names, name)
	}
	return names
}
