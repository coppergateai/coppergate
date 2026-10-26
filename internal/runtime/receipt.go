package runtime

import (
	"errors"
	"sync"
	"time"
)

// Receipt represents a runtime spend receipt.
type Receipt struct {
	ReceiptID   string    // Unique receipt ID
	LicenseID   string    // Associated spend license ID
	Amount      float64   // Amount spent
	Timestamp   time.Time // Time of acceptance
	Accepted    bool      // Whether receipt is accepted
}

// ReceiptManager manages receipts.
type ReceiptManager struct {
	mu       sync.Mutex
	receipts map[string]*Receipt
}

// NewReceiptManager creates a new ReceiptManager.
func NewReceiptManager() *ReceiptManager {
	return &ReceiptManager{
		receipts: make(map[string]*Receipt),
	}
}

// AcceptReceipt accepts a receipt and marks it as accepted.
func (rm *ReceiptManager) AcceptReceipt(receiptID, licenseID string, amount float64) error {
	rm.mu.Lock()
	defer rm.mu.Unlock()

	if amount <= 0 {
		return errors.New("amount must be positive")
	}
	if _, exists := rm.receipts[receiptID]; exists {
		return errors.New("receipt ID already exists")
	}

	rm.receipts[receiptID] = &Receipt{
		ReceiptID: receiptID,
		LicenseID: licenseID,
		Amount:    amount,
		Timestamp: time.Now(),
		Accepted:  true,
	}
	return nil
}

// GetReceipt returns a receipt by ID.
func (rm *ReceiptManager) GetReceipt(receiptID string) (*Receipt, error) {
	rm.mu.Lock()
	defer rm.mu.Unlock()

	rcpt, exists := rm.receipts[receiptID]
	if !exists {
		return nil, errors.New("receipt not found")
	}
	copy := *rcpt
	return &copy, nil
}
