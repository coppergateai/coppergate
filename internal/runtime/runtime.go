package runtime

import (
	"errors"
	"fmt"
	"sync"
	"time"
)

// RuntimeManager coordinates program runtime execution lifecycle.
type RuntimeManager struct {
	spendManager  *SpendLicenseManager
	badgeManager  *IDBadgeManager
	receiptManager *ShipReceiptManager
	mu            sync.Mutex
}

// NewRuntimeManager creates a new RuntimeManager with the given monthly spend budget (in cents).
func NewRuntimeManager(monthlyBudget int64) *RuntimeManager {
	return &RuntimeManager{
		spendManager:  NewSpendLicenseManager(monthlyBudget),
		badgeManager:  NewIDBadgeManager(),
		receiptManager: NewShipReceiptManager(),
	}
}

// ReserveSpendLicense reserves a spend license for a runtime execution.
func (rm *RuntimeManager) ReserveSpendLicense(reservationID string, amount int64) error {
	return rm.spendManager.Reserve(reservationID, amount)
}

// IssueIDBadge issues an ID badge valid for the specified duration.
func (rm *RuntimeManager) IssueIDBadge(validFor time.Duration) (*IDBadge, error) {
	return rm.badgeManager.IssueBadge(validFor)
}

// AcceptRuntimeExecution accepts the runtime execution results, marks spend license used, and issues a ship receipt.
func (rm *RuntimeManager) AcceptRuntimeExecution(reservationID string, receiptID string, details string) (*ShipReceipt, error) {
	rm.mu.Lock()
	defer rm.mu.Unlock()

	// Mark spend license as used
	err := rm.spendManager.Use(reservationID)
	if err != nil {
		return nil, fmt.Errorf("failed to use spend license: %w", err)
	}

	// Issue ship receipt
	receipt, err := rm.receiptManager.IssueReceipt(receiptID, reservationID, details)
	if err != nil {
		return nil, fmt.Errorf("failed to issue ship receipt: %w", err)
	}

	return receipt, nil
}

// ReleaseSpendLicense releases a spend license reservation.
func (rm *RuntimeManager) ReleaseSpendLicense(reservationID string) error {
	return rm.spendManager.Release(reservationID)
}

// ValidateBadge validates an ID badge.
func (rm *RuntimeManager) ValidateBadge(badgeID string) (bool, error) {
	return rm.badgeManager.ValidateBadge(badgeID)
}

// InvalidateBadge invalidates an ID badge.
func (rm *RuntimeManager) InvalidateBadge(badgeID string) error {
	return rm.badgeManager.InvalidateBadge(badgeID)
}
