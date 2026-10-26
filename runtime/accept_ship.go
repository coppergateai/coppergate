package runtime

import (
	"errors"
	"sync"
)

// RuntimeState represents the state of a program runtime contract.
type RuntimeState int

const (
	StatePending RuntimeState = iota
	StateAccepted
	StateShipped
)

// ShipReceipt represents a receipt issued when a runtime contract is shipped.
type ShipReceipt struct {
	ContractID string
	BadgeID    string
	Amount     int64
}

// RuntimeContract represents a runtime contract with spend license and badge.
type RuntimeContract struct {
	ID           string
	SpendLicense *SpendLicense
	Badge        *IDBadge
	State        RuntimeState
	mu           sync.Mutex
	Receipt      *ShipReceipt
}

// Accept transitions the contract from Pending to Accepted state.
func (rc *RuntimeContract) Accept() error {
	rc.mu.Lock()
	defer rc.mu.Unlock()

	if rc.State != StatePending {
		return errors.New("contract not in pending state")
	}

	rc.State = StateAccepted
	return nil
}

// ShipReceipt generates a ship receipt and transitions the contract to Shipped state.
func (rc *RuntimeContract) ShipReceipt(amount int64) (*ShipReceipt, error) {
	rc.mu.Lock()
	defer rc.mu.Unlock()

	if rc.State != StateAccepted {
		return nil, errors.New("contract not accepted")
	}

	if err := rc.SpendLicense.Reserve(amount); err != nil {
		return nil, err
	}

	receipt := &ShipReceipt{
		ContractID: rc.ID,
		BadgeID:    rc.Badge.ID,
		Amount:     amount,
	}

	rc.Receipt = receipt
	rc.State = StateShipped
	return receipt, nil
}
