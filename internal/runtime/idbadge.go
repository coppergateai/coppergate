package runtime

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"sync"
	"time"
)

// IDBadgeManager manages ID badges for runtime instances.
type IDBadgeManager struct {
	mu     sync.Mutex
	badges map[string]*IDBadge
}

// IDBadge represents an ID badge for a runtime instance.
type IDBadge struct {
	ID        string
	IssuedAt  time.Time
	ExpiresAt time.Time
	Valid     bool
}

// NewIDBadgeManager creates a new IDBadgeManager.
func NewIDBadgeManager() *IDBadgeManager {
	return &IDBadgeManager{
		badges: make(map[string]*IDBadge),
	}
}

// IssueBadge issues a new ID badge valid for the given duration.
func (m *IDBadgeManager) IssueBadge(validFor time.Duration) (*IDBadge, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	id, err := generateRandomID(16)
	if err != nil {
		return nil, err
	}

	now := time.Now()
	badge := &IDBadge{
		ID:        id,
		IssuedAt:  now,
		ExpiresAt: now.Add(validFor),
		Valid:     true,
	}
	m.badges[id] = badge
	return badge, nil
}

// ValidateBadge checks if the badge ID is valid and not expired.
func (m *IDBadgeManager) ValidateBadge(id string) (bool, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	badge, exists := m.badges[id]
	if !exists {
		return false, errors.New("badge not found")
	}
	if !badge.Valid {
		return false, errors.New("badge invalidated")
	}
	if time.Now().After(badge.ExpiresAt) {
		badge.Valid = false
		return false, errors.New("badge expired")
	}
	return true, nil
}

// InvalidateBadge invalidates a badge by ID.
func (m *IDBadgeManager) InvalidateBadge(id string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	badge, exists := m.badges[id]
	if !exists {
		return errors.New("badge not found")
	}
	badge.Valid = false
	return nil
}

func generateRandomID(n int) (string, error) {
	b := make([]byte, n)
	_, err := rand.Read(b)
	if err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}
