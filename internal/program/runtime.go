package program

import (
	"errors"
	"sync"
	"time"
)

// SpendEnvelope defines the monthly spend limit for a program runtime.
const SpendEnvelopeMonthly = 8.00 // $8 monthly envelope

// Badge represents an ID badge for a program runtime.
type Badge struct {
	ID        string
	IssuedAt  time.Time
	ExpiresAt time.Time
	Revoked   bool
}

// Receipt represents a ship receipt confirming acceptance.
type Receipt struct {
	ProgramID string
	Timestamp time.Time
	Details   string
}

// Runtime manages the contracted autonomy spend license and identity badges.
type Runtime struct {
	mu             sync.Mutex
	programID      string
	spendUsed      float64
	badges         map[string]*Badge
	lastReset      time.Time
	receiptHistory []Receipt
}

// NewRuntime creates a new Runtime instance for a given program ID.
func NewRuntime(programID string) *Runtime {
	return &Runtime{
		programID: programID,
		badges:    make(map[string]*Badge),
		lastReset: time.Now(),
	}
}

// resetSpendIfNeeded resets the spendUsed if a new month has started.
func (r *Runtime) resetSpendIfNeeded() {
	now := time.Now()
	if now.Sub(r.lastReset) >= 30*24*time.Hour {
		r.spendUsed = 0
		r.lastReset = now
	}
}

// ReserveSpend attempts to reserve spend amount on the runtime's envelope.
// Returns error if the spend envelope would be exceeded.
func (r *Runtime) ReserveSpend(amount float64) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	r.resetSpendIfNeeded()

	if amount <= 0 {
		return errors.New("amount must be positive")
	}

	if r.spendUsed+amount > SpendEnvelopeMonthly {
		return errors.New("spend envelope exceeded")
	}

	r.spendUsed += amount
	return nil
}

// IssueBadge issues a new ID badge valid for the specified duration.
func (r *Runtime) IssueBadge(id string, validFor time.Duration) (*Badge, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	if id == "" {
		return nil, errors.New("badge ID cannot be empty")
	}

	if _, exists := r.badges[id]; exists {
		return nil, errors.New("badge ID already exists")
	}

	now := time.Now()
	badge := &Badge{
		ID:        id,
		IssuedAt:  now,
		ExpiresAt: now.Add(validFor),
		Revoked:   false,
	}
	r.badges[id] = badge
	return badge, nil
}

// ValidateBadge checks if a badge is valid (exists, not revoked, not expired).
func (r *Runtime) ValidateBadge(id string) bool {
	r.mu.Lock()
	defer r.mu.Unlock()

	badge, exists := r.badges[id]
	if !exists || badge.Revoked {
		return false
	}
	return time.Now().Before(badge.ExpiresAt)
}

// RevokeBadge revokes a badge by ID.
func (r *Runtime) RevokeBadge(id string) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	badge, exists := r.badges[id]
	if !exists {
		return errors.New("badge not found")
	}
	if badge.Revoked {
		return errors.New("badge already revoked")
	}
	badge.Revoked = true
	return nil
}

// AcceptAction records acceptance and generates a ship receipt.
func (r *Runtime) AcceptAction(details string) Receipt {
	r.mu.Lock()
	defer r.mu.Unlock()

	receipt := Receipt{
		ProgramID: r.programID,
		Timestamp: time.Now(),
		Details:   details,
	}
	r.receiptHistory = append(r.receiptHistory, receipt)
	return receipt
}

// GetReceipts returns all ship receipts.
func (r *Runtime) GetReceipts() []Receipt {
	r.mu.Lock()
	defer r.mu.Unlock()

	copies := make([]Receipt, len(r.receiptHistory))
	copy(copies, r.receiptHistory)
	return copies
}
