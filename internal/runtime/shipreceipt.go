package runtime

import (
	"errors"
	"sync"
	"time"
)

// ShipReceiptManager manages ship receipts for accepted program runtime executions.
type ShipReceiptManager struct {
	mu       sync.Mutex
	receipts map[string]*ShipReceipt
}

// ShipReceipt represents a receipt issued upon acceptance of a runtime execution.
type ShipReceipt struct {
	ID          string
	Reservation string
	IssuedAt    time.Time
	Details     string
}

// NewShipReceiptManager creates a new ShipReceiptManager.
func NewShipReceiptManager() *ShipReceiptManager {
	return &ShipReceiptManager{
		receipts: make(map[string]*ShipReceipt),
	}
}

// IssueReceipt issues a new ship receipt for a given reservation ID.
func (m *ShipReceiptManager) IssueReceipt(id string, reservation string, details string) (*ShipReceipt, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if _, exists := m.receipts[id]; exists {
		return nil, errors.New("receipt ID already exists")
	}

	receipt := &ShipReceipt{
		ID:          id,
		Reservation: reservation,
		IssuedAt:    time.Now(),
		Details:     details,
	}
	m.receipts[id] = receipt
	return receipt, nil
}

// GetReceipt retrieves a receipt by ID.
func (m *ShipReceiptManager) GetReceipt(id string) (*ShipReceipt, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	r, exists := m.receipts[id]
	if !exists {
		return nil, errors.New("receipt not found")
	}
	return r, nil
}
