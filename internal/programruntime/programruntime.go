package programruntime

import (
	"errors"
	"sync"
	"time"
)

// Constants for spend envelope and badge validity
const (
	MonthlySpendEnvelopeCents = 800 // $8.00 in cents
	BadgeValidityDuration     = 30 * 24 * time.Hour
)

// ErrSpendLimitExceeded is returned when spend reservation exceeds monthly envelope.
var ErrSpendLimitExceeded = errors.New("spend license reservation exceeds monthly envelope")

// ErrBadgeNotFound is returned when an ID badge is not found.
var ErrBadgeNotFound = errors.New("id badge not found")

// ProgramRuntime manages program spend licenses, ID badges, and accept-to-ship transitions.
type ProgramRuntime struct {
	mu sync.Mutex

	// spendReserved tracks total spend reserved this month in cents.
	spendReserved int

	// badges maps badge IDs to badge info.
	badges map[string]*IDBadge

	// lastReset tracks the last time spendReserved was reset.
	lastReset time.Time
}

// IDBadge represents an ID badge for a program participant.
type IDBadge struct {
	ID        string
	IssuedAt  time.Time
	ExpiresAt time.Time
}

// ShipReceipt represents a receipt generated after acceptance.
type ShipReceipt struct {
	ProgramID string
	Timestamp time.Time
	Details   string
}

// New creates a new ProgramRuntime instance.
func New() *ProgramRuntime {
	return &ProgramRuntime{
		badges:    make(map[string]*IDBadge),
		lastReset: time.Now(),
	}
}

// ReserveSpendLicense attempts to reserve a spend license amount in cents.
// Returns error if reservation exceeds monthly envelope.
func (pr *ProgramRuntime) ReserveSpendLicense(amountCents int) error {
	pr.mu.Lock()
	defer pr.mu.Unlock()

	pr.resetIfNeeded()

	if pr.spendReserved+amountCents > MonthlySpendEnvelopeCents {
		return ErrSpendLimitExceeded
	}

	pr.spendReserved += amountCents
	return nil
}

// resetIfNeeded resets spendReserved if a new month has started.
func (pr *ProgramRuntime) resetIfNeeded() {
	now := time.Now()
	if now.Sub(pr.lastReset) >= 30*24*time.Hour {
		pr.spendReserved = 0
		pr.lastReset = now
	}
}

// IssueIDBadge issues a new ID badge with the given badgeID.
func (pr *ProgramRuntime) IssueIDBadge(badgeID string) *IDBadge {
	pr.mu.Lock()
	defer pr.mu.Unlock()

	now := time.Now()
	badge := &IDBadge{
		ID:        badgeID,
		IssuedAt:  now,
		ExpiresAt: now.Add(BadgeValidityDuration),
	}
	pr.badges[badgeID] = badge
	return badge
}

// GetIDBadge returns the ID badge for the given badgeID.
func (pr *ProgramRuntime) GetIDBadge(badgeID string) (*IDBadge, error) {
	pr.mu.Lock()
	defer pr.mu.Unlock()

	badge, ok := pr.badges[badgeID]
	if !ok {
		return nil, ErrBadgeNotFound
	}
	return badge, nil
}

// AcceptAndShip processes acceptance and returns a ShipReceipt.
func (pr *ProgramRuntime) AcceptAndShip(programID string, details string) *ShipReceipt {
	return &ShipReceipt{
		ProgramID: programID,
		Timestamp: time.Now(),
		Details:   details,
	}
}
