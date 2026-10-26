package runtime

import (
	"errors"
	"fmt"
	"sync"
	"time"
)

// SpendLicense represents a contracted autonomy spend license with a monthly envelope.
type SpendLicense struct {
	MonthlyEnvelopeCents int64 // e.g. 800 cents = $8
	mu                   sync.Mutex
	ReservedCents        int64
	ConsumedCents        int64
	IDBadges             map[string]*IDBadge
}

// IDBadge represents an authorization badge for spend license consumption.
type IDBadge struct {
	ID        string
	IssuedAt  time.Time
	Consumed  int64 // cents consumed under this badge
	Revoked   bool
	RevokedAt time.Time
}

// ShipReceipt confirms accepted spend license usage.
type ShipReceipt struct {
	BadgeID    string
	AmountCents int64
	Timestamp  time.Time
}

// NewSpendLicense creates a new spend license with the given monthly envelope.
func NewSpendLicense(monthlyEnvelopeCents int64) *SpendLicense {
	return &SpendLicense{
		MonthlyEnvelopeCents: monthlyEnvelopeCents,
		IDBadges:             make(map[string]*IDBadge),
	}
}

// Reserve attempts to reserve a specified amount of cents from the monthly envelope.
// Returns an error if insufficient funds are available.
func (sl *SpendLicense) Reserve(amountCents int64) error {
	sl.mu.Lock()
	defer sl.mu.Unlock()

	available := sl.MonthlyEnvelopeCents - sl.ReservedCents - sl.ConsumedCents
	if amountCents <= 0 {
		return errors.New("reserve amount must be positive")
	}
	if amountCents > available {
		return fmt.Errorf("insufficient funds: requested %d cents, available %d cents", amountCents, available)
	}
	sl.ReservedCents += amountCents
	return nil
}

// IssueIDBadge issues a new ID badge for spend license consumption.
func (sl *SpendLicense) IssueIDBadge(id string) (*IDBadge, error) {
	sl.mu.Lock()
	defer sl.mu.Unlock()

	if _, exists := sl.IDBadges[id]; exists {
		return nil, fmt.Errorf("badge ID %s already exists", id)
	}
	badge := &IDBadge{
		ID:       id,
		IssuedAt: time.Now(),
	}
	sl.IDBadges[id] = badge
	return badge, nil
}

// AcceptUsage accepts spend license usage for a given badge and amount.
// Returns a ShipReceipt confirming the usage.
func (sl *SpendLicense) AcceptUsage(badgeID string, amountCents int64) (*ShipReceipt, error) {
	sl.mu.Lock()
	defer sl.mu.Unlock()

	badge, exists := sl.IDBadges[badgeID]
	if !exists {
		return nil, fmt.Errorf("badge ID %s not found", badgeID)
	}
	if badge.Revoked {
		return nil, fmt.Errorf("badge ID %s is revoked", badgeID)
	}
	if amountCents <= 0 {
		return nil, errors.New("usage amount must be positive")
	}
	if amountCents > sl.ReservedCents {
		return nil, fmt.Errorf("usage amount %d exceeds reserved %d", amountCents, sl.ReservedCents)
	}

	// Consume reserved amount
	sl.ReservedCents -= amountCents
	sl.ConsumedCents += amountCents
	badge.Consumed += amountCents

	receipt := &ShipReceipt{
		BadgeID:    badgeID,
		AmountCents: amountCents,
		Timestamp:  time.Now(),
	}
	return receipt, nil
}

// RevokeBadge revokes an ID badge, preventing further usage acceptance.
func (sl *SpendLicense) RevokeBadge(badgeID string) error {
	sl.mu.Lock()
	defer sl.mu.Unlock()

	badge, exists := sl.IDBadges[badgeID]
	if !exists {
		return fmt.Errorf("badge ID %s not found", badgeID)
	}
	if badge.Revoked {
		return fmt.Errorf("badge ID %s already revoked", badgeID)
	}
	badge.Revoked = true
	badge.RevokedAt = time.Now()
	return nil
}

// LandingData represents landed usage data for writeback.
type LandingData struct {
	BadgeID     string
	AmountCents int64
	Timestamp   time.Time
}

// LandUsage lands usage data and writes back to update spend license state.
func (sl *SpendLicense) LandUsage(data LandingData) error {
	sl.mu.Lock()
	defer sl.mu.Unlock()

	badge, exists := sl.IDBadges[data.BadgeID]
	if !exists {
		return fmt.Errorf("badge ID %s not found", data.BadgeID)
	}
	if data.AmountCents <= 0 {
		return errors.New("landed amount must be positive")
	}

	// For simplicity, landing usage adds to consumed if not already accounted.
	// In a real system, deduplication and idempotency would be needed.
	badge.Consumed += data.AmountCents
	sl.ConsumedCents += data.AmountCents

	return nil
}
