package programruntime

import (
	"errors"
	"fmt"
	"sync"
	"time"
)

// SpendLicenseManager manages spend licenses for program runtimes.
type SpendLicenseManager struct {
	mu            sync.Mutex
	monthlyEnvelopeCents int64 // e.g. 800 cents = $8.00
	usedCents     int64
	lastReset     time.Time
}

// IDBadge represents an authorization badge for a program runtime.
type IDBadge struct {
	ProgramID string
	Valid     bool
}

// ShipReceipt confirms a spend license transaction.
type ShipReceipt struct {
	ProgramID string
	AmountCents int64
	Timestamp time.Time
	ReceiptID string
}

// NewSpendLicenseManager creates a new manager with the given monthly envelope in cents.
func NewSpendLicenseManager(monthlyEnvelopeCents int64) *SpendLicenseManager {
	return &SpendLicenseManager{
		monthlyEnvelopeCents: monthlyEnvelopeCents,
		lastReset:            time.Now(),
	}
}

// ResetIfNeeded resets usage if a new month has started.
func (m *SpendLicenseManager) ResetIfNeeded() {
	m.mu.Lock()
	defer m.mu.Unlock()
	now := time.Now()
	if now.Month() != m.lastReset.Month() || now.Year() != m.lastReset.Year() {
		m.usedCents = 0
		m.lastReset = now
	}
}

// Reserve attempts to reserve spend license for the given amount in cents.
// Returns error if insufficient funds or invalid badge.
func (m *SpendLicenseManager) Reserve(badge IDBadge, amountCents int64) error {
	if !badge.Valid {
		return errors.New("invalid ID badge")
	}
	if amountCents <= 0 {
		return errors.New("amount must be positive")
	}

	m.mu.Lock()
	defer m.mu.Unlock()

	m.ResetIfNeeded()

	if m.usedCents+amountCents > m.monthlyEnvelopeCents {
		return fmt.Errorf("insufficient spend license: requested %d cents, available %d cents",
			amountCents, m.monthlyEnvelopeCents-m.usedCents)
	}

	// Reserve by increasing used amount
	m.usedCents += amountCents
	return nil
}

// Accept finalizes the spend license usage and returns a ship receipt.
func (m *SpendLicenseManager) Accept(badge IDBadge, amountCents int64) (*ShipReceipt, error) {
	if !badge.Valid {
		return nil, errors.New("invalid ID badge")
	}
	if amountCents <= 0 {
		return nil, errors.New("amount must be positive")
	}

	m.mu.Lock()
	defer m.mu.Unlock()

	// Accept means the amount was already reserved, so just generate receipt
	receipt := &ShipReceipt{
		ProgramID:  badge.ProgramID,
		AmountCents: amountCents,
		Timestamp:  time.Now(),
		ReceiptID:  fmt.Sprintf("receipt-%d", time.Now().UnixNano()),
	}
	return receipt, nil
}

// GetUsed returns the current used cents.
func (m *SpendLicenseManager) GetUsed() int64 {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.usedCents
}

// GetAvailable returns the remaining cents available.
func (m *SpendLicenseManager) GetAvailable() int64 {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.ResetIfNeeded()
	return m.monthlyEnvelopeCents - m.usedCents
}
