package programruntime

import (
	"errors"
	"sync"
)

// RuntimeState represents the state of a program runtime operation.
type RuntimeState string

const (
	StatePending   RuntimeState = "Pending"
	StateAccepted  RuntimeState = "Accept"
	StateShipReceipt RuntimeState = "ShipReceipt"
)

// RuntimeOperation represents a program runtime operation.
type RuntimeOperation struct {
	ID        string
	BadgeID   string
	Spend     int64 // spend amount in cents
	State     RuntimeState
	processed bool
}

// RuntimeManager manages program runtime operations.
type RuntimeManager struct {
	mu          sync.Mutex
	licenseMgr  *LicenseManager
	badgeMgr    *BadgeManager
	operations  map[string]*RuntimeOperation
}

// NewRuntimeManager creates a new RuntimeManager.
func NewRuntimeManager(licenseMgr *LicenseManager, badgeMgr *BadgeManager) *RuntimeManager {
	return &RuntimeManager{
		licenseMgr: licenseMgr,
		badgeMgr:   badgeMgr,
		operations: make(map[string]*RuntimeOperation),
	}
}

// CreateOperation creates a new runtime operation in Pending state.
func (rm *RuntimeManager) CreateOperation(id, badgeID string, spend int64) (*RuntimeOperation, error) {
	rm.mu.Lock()
	defer rm.mu.Unlock()
	if id == "" || badgeID == "" {
		return nil, errors.New("operation id and badge id required")
	}
	if spend <= 0 {
		return nil, errors.New("spend must be positive")
	}
	if !rm.badgeMgr.ValidateBadge(badgeID) {
		return nil, errors.New("invalid or inactive badge")
	}
	if _, exists := rm.operations[id]; exists {
		return nil, errors.New("operation id already exists")
	}
	op := &RuntimeOperation{
		ID:      id,
		BadgeID: badgeID,
		Spend:   spend,
		State:   StatePending,
	}
	rm.operations[id] = op
	return op, nil
}

// AcceptOperation transitions operation from Pending to Accept and reserves spend license.
func (rm *RuntimeManager) AcceptOperation(id string) error {
	rm.mu.Lock()
	defer rm.mu.Unlock()
	op, exists := rm.operations[id]
	if !exists {
		return errors.New("operation not found")
	}
	if op.State != StatePending {
		return errors.New("operation not in pending state")
	}
	if err := rm.licenseMgr.ReserveSpend(op.Spend); err != nil {
		return err
	}
	op.State = StateAccepted
	return nil
}

// ShipReceiptOperation transitions operation from Accept to ShipReceipt, finalizing spend.
func (rm *RuntimeManager) ShipReceiptOperation(id string) error {
	rm.mu.Lock()
	defer rm.mu.Unlock()
	op, exists := rm.operations[id]
	if !exists {
		return errors.New("operation not found")
	}
	if op.State != StateAccepted {
		return errors.New("operation not in accept state")
	}
	op.State = StateShipReceipt
	op.processed = true
	return nil
}

// GetOperation returns the operation by id.
func (rm *RuntimeManager) GetOperation(id string) (*RuntimeOperation, bool) {
	rm.mu.Lock()
	defer rm.mu.Unlock()
	op, exists := rm.operations[id]
	return op, exists
}
