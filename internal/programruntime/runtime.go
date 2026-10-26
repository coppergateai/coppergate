package programruntime

import (
	"errors"
	"sync"
	"time"
)

// Constants for spend envelope
const (
	MonthlySpendEnvelopeCents = 800 // $8.00 in cents
)

// IDBadge represents an identity badge for a program participant.
type IDBadge struct {
	ID        string
	IssuedAt  time.Time
	ExpiresAt time.Time
	Valid     bool
}

// SpendLicense manages the spend license state.
type SpendLicense struct {
	mu            sync.Mutex
	ReservedCents int
	SpentCents    int
}

// ProgramRuntime manages the contracted autonomy runtime state.
type ProgramRuntime struct {
	license      *SpendLicense
	idBadges     map[string]*IDBadge
	accepted     map[string]bool
	shipReceipts map[string]bool
}

// NewProgramRuntime creates a new ProgramRuntime instance.
func NewProgramRuntime() *ProgramRuntime {
	return &ProgramRuntime{
		license: &SpendLicense{},
		idBadges: make(map[string]*IDBadge),
		accepted: make(map[string]bool),
		shipReceipts: make(map[string]bool),
	}
}

// ReserveSpend attempts to reserve spend cents on the license.
// Returns error if reservation exceeds monthly envelope.
func (pr *ProgramRuntime) ReserveSpend(cents int) error {
	pr.license.mu.Lock()
	defer pr.license.mu.Unlock()

	if pr.license.ReservedCents+cents > MonthlySpendEnvelopeCents {
		return errors.New("spend reservation exceeds monthly envelope")
	}
	pr.license.ReservedCents += cents
	return nil
}

// FanOutSpend releases reserved spend and marks it as spent.
func (pr *ProgramRuntime) FanOutSpend(cents int) error {
	pr.license.mu.Lock()
	defer pr.license.mu.Unlock()

	if cents > pr.license.ReservedCents {
		return errors.New("cannot fan-out more than reserved")
	}
	pr.license.ReservedCents -= cents
	pr.license.SpentCents += cents
	return nil
}

// IssueIDBadge issues a new ID badge for a participant.
func (pr *ProgramRuntime) IssueIDBadge(id string, validDuration time.Duration) *IDBadge {
	badge := &IDBadge{
		ID:        id,
		IssuedAt:  time.Now(),
		ExpiresAt: time.Now().Add(validDuration),
		Valid:     true,
	}
	pr.idBadges[id] = badge
	return badge
}

// ValidateIDBadge checks if the badge is valid and not expired.
func (pr *ProgramRuntime) ValidateIDBadge(id string) bool {
	badge, ok := pr.idBadges[id]
	if !ok {
		return false
	}
	if !badge.Valid {
		return false
	}
	if time.Now().After(badge.ExpiresAt) {
		badge.Valid = false
		return false
	}
	return true
}

// Accept marks an item as accepted.
func (pr *ProgramRuntime) Accept(itemID string) {
	pr.accepted[itemID] = true
}

// ShipReceipt transitions an accepted item to shipped receipt.
func (pr *ProgramRuntime) ShipReceipt(itemID string) error {
	if !pr.accepted[itemID] {
		return errors.New("item not accepted")
	}
	pr.shipReceipts[itemID] = true
	return nil
}

// IsShipped checks if an item has been shipped.
func (pr *ProgramRuntime) IsShipped(itemID string) bool {
	return pr.shipReceipts[itemID]
}
