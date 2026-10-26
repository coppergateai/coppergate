package runtime

import (
	"crypto/rand"
	"encoding/hex"
	"sync"
	"time"
)

// IDBadge represents an identity badge for a program participant or runtime instance.
type IDBadge struct {
	ID        string
	issuedAt  time.Time
	validFor  time.Duration
	mu        sync.RWMutex
	revoked   bool
	participantID string
}

// badgeStore holds issued badges for validation and revocation.
var (
	badgeStore = make(map[string]*IDBadge)
	storeMu    sync.RWMutex
)

// IssueIDBadge issues a new ID badge for a participant with a default validity of 24 hours.
func IssueIDBadge(participantID string) *IDBadge {
	id := generateBadgeID()
	badge := &IDBadge{
		ID:        id,
		issuedAt:  time.Now().UTC(),
		validFor:  24 * time.Hour,
		participantID: participantID,
	}
	storeMu.Lock()
	badgeStore[id] = badge
	storeMu.Unlock()
	return badge
}

// IsValid checks if the badge is currently valid (not revoked and within validity period).
func (b *IDBadge) IsValid() bool {
	b.mu.RLock()
	defer b.mu.RUnlock()
	if b.revoked {
		return false
	}
	return time.Since(b.issuedAt) < b.validFor
}

// Revoke invalidates the badge.
func (b *IDBadge) Revoke() {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.revoked = true
	storeMu.Lock()
	delete(badgeStore, b.ID)
	storeMu.Unlock()
}

// ValidateBadge returns true if the badge with given ID is valid.
func ValidateBadge(id string) bool {
	storeMu.RLock()
	badge, ok := badgeStore[id]
	storeMu.RUnlock()
	if !ok {
		return false
	}
	return badge.IsValid()
}

func generateBadgeID() string {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}
