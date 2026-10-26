package programruntime

import (
	"errors"
	"fmt"
	"sync"
	"time"
)

// SpendLicense represents a contracted autonomy spend license with a budget envelope.
type SpendLicense struct {
	ID           string
	TotalBudget  float64
	Reserved     float64
	Badges       map[string]*IDBadge
	Mutex        sync.Mutex
	CreatedAt    time.Time
	LastModified time.Time
}

// IDBadge represents an identity badge issued to a spend license holder.
type IDBadge struct {
	BadgeID    string
	HolderName string
	IssuedAt   time.Time
	ValidUntil time.Time
}

// ShipReceipt represents a receipt generated upon acceptance of a spend license reservation.
type ShipReceipt struct {
	ReceiptID   string
	LicenseID   string
	Amount      float64
	IssuedAt    time.Time
	Description string
}

// NewSpendLicense creates a new spend license with the specified total budget.
func NewSpendLicense(id string, totalBudget float64) *SpendLicense {
	return &SpendLicense{
		ID:           id,
		TotalBudget:  totalBudget,
		Reserved:     0,
		Badges:       make(map[string]*IDBadge),
		CreatedAt:    time.Now(),
		LastModified: time.Now(),
	}
}

// Reserve attempts to reserve an amount from the spend license budget.
// Returns error if insufficient budget available.
func (sl *SpendLicense) Reserve(amount float64) error {
	sl.Mutex.Lock()
	defer sl.Mutex.Unlock()

	if amount <= 0 {
		return errors.New("reserve amount must be positive")
	}

	available := sl.TotalBudget - sl.Reserved
	if amount > available {
		return fmt.Errorf("insufficient budget: requested %.2f, available %.2f", amount, available)
	}

	sl.Reserved += amount
	sl.LastModified = time.Now()
	return nil
}

// FanOut splits a reserved amount into smaller spend licenses.
// Returns error if amount exceeds reserved budget.
func (sl *SpendLicense) FanOut(amount float64, newID string) (*SpendLicense, error) {
	sl.Mutex.Lock()
	defer sl.Mutex.Unlock()

	if amount <= 0 {
		return nil, errors.New("fan-out amount must be positive")
	}

	if amount > sl.Reserved {
		return nil, fmt.Errorf("insufficient reserved budget: requested %.2f, reserved %.2f", amount, sl.Reserved)
	}

	// Reduce reserved budget by amount to fan out
	sl.Reserved -= amount
	sl.LastModified = time.Now()

	// Create new spend license with the fan-out amount
	newLicense := NewSpendLicense(newID, amount)
	return newLicense, nil
}

// IssueBadge issues an ID badge to a holder for this spend license.
func (sl *SpendLicense) IssueBadge(badgeID, holderName string, validDuration time.Duration) (*IDBadge, error) {
	sl.Mutex.Lock()
	defer sl.Mutex.Unlock()

	if badgeID == "" || holderName == "" {
		return nil, errors.New("badgeID and holderName must be non-empty")
	}

	if _, exists := sl.Badges[badgeID]; exists {
		return nil, fmt.Errorf("badgeID %s already issued", badgeID)
	}

	now := time.Now()
	badge := &IDBadge{
		BadgeID:    badgeID,
		HolderName: holderName,
		IssuedAt:   now,
		ValidUntil: now.Add(validDuration),
	}

	sl.Badges[badgeID] = badge
	sl.LastModified = now
	return badge, nil
}

// AcceptReservation accepts a reserved amount and generates a ship receipt.
// The amount must be less or equal to reserved budget.
func (sl *SpendLicense) AcceptReservation(amount float64, receiptID, description string) (*ShipReceipt, error) {
	sl.Mutex.Lock()
	defer sl.Mutex.Unlock()

	if amount <= 0 {
		return nil, errors.New("accept amount must be positive")
	}

	if amount > sl.Reserved {
		return nil, fmt.Errorf("insufficient reserved budget to accept: requested %.2f, reserved %.2f", amount, sl.Reserved)
	}

	sl.Reserved -= amount
	sl.LastModified = time.Now()

	receipt := &ShipReceipt{
		ReceiptID:   receiptID,
		LicenseID:   sl.ID,
		Amount:      amount,
		IssuedAt:    time.Now(),
		Description: description,
	}

	return receipt, nil
}
