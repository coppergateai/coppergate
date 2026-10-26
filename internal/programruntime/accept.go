package programruntime

import (
	"errors"
	"sync"
	"time"
)

// ShipReceipt confirms the acceptance and shipping of a runtime operation.
type ShipReceipt struct {
	Badge     IDBadge
	Timestamp time.Time
	Amount    int64 // spend amount in cents
}

// AcceptManager manages acceptance and ship receipts.
type AcceptManager struct {
	mu       sync.Mutex
	receipts map[string]ShipReceipt
}

// NewAcceptManager creates a new AcceptManager.
func NewAcceptManager() *AcceptManager {
	return &AcceptManager{
		receipts: make(map[string]ShipReceipt),
	}
}

// Accept confirms the operation identified by the badge and amount, generating a ship receipt.
func (am *AcceptManager) Accept(badge IDBadge, amount int64) (ShipReceipt, error) {
	if err := badge.Validate(); err != nil {
		return ShipReceipt{}, err
	}
	if amount <= 0 {
		return ShipReceipt{}, errors.New("amount must be positive")
	}

	am.mu.Lock()
	defer am.mu.Unlock()

	key := badge.ID
	if _, exists := am.receipts[key]; exists {
		return ShipReceipt{}, errors.New("operation already accepted")
	}

	receipt := ShipReceipt{
		Badge:     badge,
		Timestamp: time.Now().UTC(),
		Amount:    amount,
	}
	am.receipts[key] = receipt
	return receipt, nil
}

// GetReceipt returns the ship receipt for a given badge, if any.
func (am *AcceptManager) GetReceipt(badge IDBadge) (ShipReceipt, bool) {
	am.mu.Lock()
	defer am.mu.Unlock()
	receipt, ok := am.receipts[badge.ID]
	return receipt, ok
}
