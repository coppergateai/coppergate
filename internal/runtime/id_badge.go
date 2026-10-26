package runtime

import (
	"errors"
	"sync"
	"time"
)

// IDBadge represents a digital identity badge for a program.
type IDBadge struct {
	BadgeID    string    // Unique badge identifier
	ProgramID  string    // Associated program ID
	IssuedAt   time.Time // Timestamp of issuance
	ExpiresAt  time.Time // Expiration timestamp
	Valid      bool      // Badge validity
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

// IssueBadge issues a new badge for a program with a validity duration.
func (bm *BadgeManager) IssueBadge(badgeID, programID string, validFor time.Duration) error {
	bm.mu.Lock()
	defer bm.mu.Unlock()

	if _, exists := bm.badges[badgeID]; exists {
		return errors.New("badge ID already exists")
	}
	now := time.Now()
	bm.badges[badgeID] = &IDBadge{
		BadgeID:   badgeID,
		ProgramID: programID,
		IssuedAt:  now,
		ExpiresAt: now.Add(validFor),
		Valid:     true,
	}
	return nil
}

// ValidateBadge checks if a badge is valid and not expired.
func (bm *BadgeManager) ValidateBadge(badgeID string) (bool, error) {
	bm.mu.Lock()
	defer bm.mu.Unlock()

	badge, exists := bm.badges[badgeID]
	if !exists {
		return false, errors.New("badge not found")
	}
	if !badge.Valid {
		return false, nil
	}
	if time.Now().After(badge.ExpiresAt) {
		badge.Valid = false
		return false, nil
	}
	return true, nil
}

// RevokeBadge invalidates a badge.
func (bm *BadgeManager) RevokeBadge(badgeID string) error {
	bm.mu.Lock()
	defer bm.mu.Unlock()

	badge, exists := bm.badges[badgeID]
	if !exists {
		return errors.New("badge not found")
	}
	badge.Valid = false
	return nil
}
