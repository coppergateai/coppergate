package runtime

import (
	"errors"
	"sync"
)

// SpendLicense represents a spend license with a monthly envelope and current reserved amount.
type SpendLicense struct {
	MonthlyEnvelope float64 // e.g. $8.00
	Reserved        float64
	mu              sync.Mutex
}

// NewSpendLicense creates a new spend license with the given monthly envelope.
func NewSpendLicense(monthlyEnvelope float64) *SpendLicense {
	return &SpendLicense{
		MonthlyEnvelope: monthlyEnvelope,
		Reserved:        0,
	}
}

// Reserve attempts to reserve an amount from the spend license.
// Returns error if reservation would exceed the monthly envelope.
func (sl *SpendLicense) Reserve(amount float64) error {
	sl.mu.Lock()
	defer sl.mu.Unlock()
	if amount <= 0 {
		return errors.New("reserve amount must be positive")
	}
	if sl.Reserved+amount > sl.MonthlyEnvelope {
		return errors.New("spend license reservation exceeds monthly envelope")
	}
	sl.Reserved += amount
	return nil
}

// Release releases a previously reserved amount.
func (sl *SpendLicense) Release(amount float64) error {
	sl.mu.Lock()
	defer sl.mu.Unlock()
	if amount <= 0 {
		return errors.New("release amount must be positive")
	}
	if amount > sl.Reserved {
		return errors.New("release amount exceeds reserved amount")
	}
	sl.Reserved -= amount
	return nil
}

// IDBadge represents an ID badge for program runtime authorization.
type IDBadge struct {
	ProgramID string
	Valid     bool
}

// NewIDBadge creates a new valid ID badge for a program.
func NewIDBadge(programID string) *IDBadge {
	return &IDBadge{
		ProgramID: programID,
		Valid:     true,
	}
}

// Invalidate marks the badge as invalid.
func (b *IDBadge) Invalidate() {
	b.Valid = false
}

// ShipReceipt represents a receipt confirming spend license acceptance.
type ShipReceipt struct {
	ProgramID string
	Amount    float64
	Accepted  bool
}

// AcceptSpendLicense accepts a spend license reservation and returns a ship receipt.
func AcceptSpendLicense(programID string, sl *SpendLicense, amount float64) (*ShipReceipt, error) {
	if sl == nil {
		return nil, errors.New("spend license is nil")
	}
	if amount <= 0 {
		return nil, errors.New("accept amount must be positive")
	}
	// Confirm reservation exists
	sl.mu.Lock()
	defer sl.mu.Unlock()
	if amount > sl.Reserved {
		return nil, errors.New("accept amount exceeds reserved amount")
	}
	// Mark accepted by reducing reserved amount and generating receipt
	sl.Reserved -= amount
	receipt := &ShipReceipt{
		ProgramID: programID,
		Amount:    amount,
		Accepted:  true,
	}
	return receipt, nil
}
