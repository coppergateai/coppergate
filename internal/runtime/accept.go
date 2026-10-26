package runtime

import (
	"errors"
	"sync"
	"time"
)

// ShipReceipt represents a receipt generated after accepting a program runtime contract.
type ShipReceipt struct {
	ID         string
	ContractID string
	Timestamp  time.Time
}

var (
	receiptStore = make(map[string]*ShipReceipt)
	receiptMu    sync.Mutex
)

// AcceptContract accepts a runtime contract by its ID and returns a ShipReceipt.
// Returns error if contractID is empty or acceptance fails.
func AcceptContract(contractID string) (*ShipReceipt, error) {
	if contractID == "" {
		return nil, errors.New("contractID cannot be empty")
	}
	receipt := &ShipReceipt{
		ID:         generateReceiptID(),
		ContractID: contractID,
		Timestamp:  time.Now().UTC(),
	}
	receiptMu.Lock()
	receiptStore[receipt.ID] = receipt
	receiptMu.Unlock()
	return receipt, nil
}

func generateReceiptID() string {
	// Reuse badge ID generator for simplicity
	return generateBadgeID()
}
