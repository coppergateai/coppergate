package programruntime

import (
	"errors"
	"sync"
)

// IDBadge represents an issued badge for a program participant.
type IDBadge struct {
	ID     string
	Owner  string
	Active bool
}

// BadgeManager manages ID badges.
type BadgeManager struct {
	mu     sync.Mutex
	badges map[string]*IDBadge
}

// NewBadgeManager creates a new BadgeManager.
func NewBadgeManager() *BadgeManager {
	return &BadgeManager{
		badges: make(map[string]*IDBadge),
	}
}

// IssueBadge issues a new badge for the given owner.
func (bm *BadgeManager) IssueBadge(id, owner string) (*IDBadge, error) {
	bm.mu.Lock()
	defer bm.mu.Unlock()
	if id == "" || owner == "" {
		return nil, errors.New("badge id and owner required")
	}
	if _, exists := bm.badges[id]; exists {
		return nil, errors.New("badge id already exists")
	}
	badge := &IDBadge{
		ID:     id,
		Owner:  owner,
		Active: true,
	}
	bm.badges[id] = badge
	return badge, nil
}

// RevokeBadge deactivates a badge.
func (bm *BadgeManager) RevokeBadge(id string) error {
	bm.mu.Lock()
	defer bm.mu.Unlock()
	badge, exists := bm.badges[id]
	if !exists {
		return errors.New("badge not found")
	}
	badge.Active = false
	return nil
}

// ValidateBadge checks if a badge is active and exists.
func (bm *BadgeManager) ValidateBadge(id string) bool {
	bm.mu.Lock()
	defer bm.mu.Unlock()
	badge, exists := bm.badges[id]
	return exists && badge.Active
}
