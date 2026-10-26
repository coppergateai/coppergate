package program

import (
	"errors"
	"fmt"
	"sync"
	"time"
)

// Constants for spend envelope
const (
	MonthlySpendEnvelope = 8.00
)

// Badge represents an ID badge issued to an entity.
type Badge struct {
	Entity    string
	IssuedAt  time.Time
	ExpiresAt time.Time
	Signature string // Simplified signature placeholder
}

// SpendLicense tracks reserved and spent amounts.
type SpendLicense struct {
	Reserved float64
	Spent    float64
	mu       sync.Mutex
}

// Runtime manages program runtime state.
type Runtime struct {
	Spend    SpendLicense
	Badges   map[string]Badge
	Receipts []ShipReceipt
	mu       sync.Mutex
}

// ShipReceipt represents a receipt generated on acceptance.
type ShipReceipt struct {
	Timestamp time.Time
	ProgramID string
	Amount    float64
	Details   string
}

// NewRuntime creates a new Runtime instance.
func NewRuntime() *Runtime {
	return &Runtime{
		Spend:  SpendLicense{},
		Badges: make(map[string]Badge),
	}
}

// ReserveSpend reserves an amount from the monthly envelope.
func (r *Runtime) ReserveSpend(amount float64) error {
	r.Spend.mu.Lock()
	defer r.Spend.mu.Unlock()

	if amount <= 0 {
		return errors.New("reserve amount must be positive")
	}
	if r.Spend.Reserved+amount > MonthlySpendEnvelope {
		return fmt.Errorf("reserve exceeds monthly envelope: %.2f + %.2f > %.2f",
			r.Spend.Reserved, amount, MonthlySpendEnvelope)
	}
	r.Spend.Reserved += amount
	return nil
}

// FanOutSpend allocates reserved spend to a subcomponent.
func (r *Runtime) FanOutSpend(amount float64) error {
	r.Spend.mu.Lock()
	defer r.Spend.mu.Unlock()

	if amount <= 0 {
		return errors.New("fan-out amount must be positive")
	}
	if r.Spend.Spent+amount > r.Spend.Reserved {
		return fmt.Errorf("fan-out exceeds reserved spend: %.2f + %.2f > %.2f",
			r.Spend.Spent, amount, r.Spend.Reserved)
	}
	r.Spend.Spent += amount
	return nil
}

// IssueBadge issues an ID badge to an entity.
func (r *Runtime) IssueBadge(entity string) (Badge, error) {
	if entity == "" {
		return Badge{}, errors.New("entity cannot be empty")
	}
	r.mu.Lock()
	defer r.mu.Unlock()

	now := time.Now()
	badge := Badge{
		Entity:    entity,
		IssuedAt:  now,
		ExpiresAt: now.Add(24 * time.Hour),
		Signature: fmt.Sprintf("signed-%s-%d", entity, now.Unix()), // simplified
	}
	r.Badges[entity] = badge
	return badge, nil
}

// AcceptOutput accepts an output and generates a ship receipt.
func (r *Runtime) AcceptOutput(programID string, amount float64, details string) (ShipReceipt, error) {
	if programID == "" {
		return ShipReceipt{}, errors.New("programID cannot be empty")
	}
	if amount <= 0 {
		return ShipReceipt{}, errors.New("amount must be positive")
	}

	r.mu.Lock()
	defer r.mu.Unlock()

	receipt := ShipReceipt{
		Timestamp: time.Now(),
		ProgramID: programID,
		Amount:    amount,
		Details:   details,
	}
	r.Receipts = append(r.Receipts, receipt)
	return receipt, nil
}
