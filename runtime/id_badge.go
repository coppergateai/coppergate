package runtime

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"sync"
)

// IDBadge represents a program runtime identity badge.
type IDBadge struct {
	ID string
}

type badgeRegistry struct {
	mu     sync.Mutex
	badges map[string]struct{}
}

var registry = &badgeRegistry{
	badges: make(map[string]struct{}),
}

// NewIDBadge generates a new unique ID badge.
func NewIDBadge() (*IDBadge, error) {
	id, err := generateRandomID(16)
	if err != nil {
		return nil, err
	}

	registry.mu.Lock()
	defer registry.mu.Unlock()

	// Ensure uniqueness (extremely unlikely to collide)
	if _, exists := registry.badges[id]; exists {
		return nil, errors.New("id badge collision")
	}

	registry.badges[id] = struct{}{}
	return &IDBadge{ID: id}, nil
}

// Validate checks if the given ID badge is valid and registered.
func Validate(id string) bool {
	registry.mu.Lock()
	defer registry.mu.Unlock()
	_, exists := registry.badges[id]
	return exists
}

func generateRandomID(n int) (string, error) {
	b := make([]byte, n)
	_, err := rand.Read(b)
	if err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}
