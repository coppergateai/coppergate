package program

import (
	"errors"
	"fmt"
	"sync"
	"time"
)

// Constants for spend limits
const (
	MonthlySpendEnvelope = 8.0
)

// Badge represents an ID badge issued to an agent.
type Badge struct {
	AgentID   string
	IssuedAt  time.Time
	BadgeID   string
	Valid     bool
}

// ShipReceipt represents a receipt generated after accepting and shipping a contract.
type ShipReceipt struct {
	ContractID string
	ShippedAt  time.Time
	ReceiptID  string
}

// ProgramRuntime manages contracted autonomy spend licenses, ID badges, and accept-to-ship receipt workflow.
type ProgramRuntime struct {
	mu             sync.Mutex
	spendReserved  float64
	badges         map[string]Badge
	shipReceipts   map[string]ShipReceipt
}

// NewProgramRuntime creates a new ProgramRuntime instance.
func NewProgramRuntime() *ProgramRuntime {
	return &ProgramRuntime{
		badges:       make(map[string]Badge),
		shipReceipts: make(map[string]ShipReceipt),
	}
}

// ReserveSpend reserves a spend license amount within the monthly envelope.
// Returns error if reservation exceeds the monthly spend envelope.
func (pr *ProgramRuntime) ReserveSpend(amount float64) error {
	pr.mu.Lock()
	defer pr.mu.Unlock()

	if amount <= 0 {
		return errors.New("reserve amount must be positive")
	}

	if pr.spendReserved+amount > MonthlySpendEnvelope {
		return fmt.Errorf("spend reservation exceeds monthly envelope of $%.2f", MonthlySpendEnvelope)
	}

	pr.spendReserved += amount
	return nil
}

// IssueIDBadge issues an ID badge to the given agent ID.
func (pr *ProgramRuntime) IssueIDBadge(agentID string) (Badge, error) {
	pr.mu.Lock()
	defer pr.mu.Unlock()

	if agentID == "" {
		return Badge{}, errors.New("agentID cannot be empty")
	}

	badgeID := fmt.Sprintf("badge-%d", time.Now().UnixNano())
	badge := Badge{
		AgentID:  agentID,
		IssuedAt: time.Now(),
		BadgeID:  badgeID,
		Valid:    true,
	}

	pr.badges[badgeID] = badge
	return badge, nil
}

// AcceptContract accepts a contract and generates a ship receipt.
func (pr *ProgramRuntime) AcceptContract(contractID string) (ShipReceipt, error) {
	pr.mu.Lock()
	defer pr.mu.Unlock()

	if contractID == "" {
		return ShipReceipt{}, errors.New("contractID cannot be empty")
	}

	receiptID := fmt.Sprintf("receipt-%d", time.Now().UnixNano())
	receipt := ShipReceipt{
		ContractID: contractID,
		ShippedAt:  time.Now(),
		ReceiptID:  receiptID,
	}

	pr.shipReceipts[receiptID] = receipt
	return receipt, nil
}

// GetSpendReserved returns the current reserved spend amount.
func (pr *ProgramRuntime) GetSpendReserved() float64 {
	pr.mu.Lock()
	defer pr.mu.Unlock()
	return pr.spendReserved
}

// IsBadgeValid checks if a badge ID is valid.
func (pr *ProgramRuntime) IsBadgeValid(badgeID string) bool {
	pr.mu.Lock()
	defer pr.mu.Unlock()
	badge, exists := pr.badges[badgeID]
	return exists && badge.Valid
}

// GetShipReceipt returns a ship receipt by receipt ID.
func (pr *ProgramRuntime) GetShipReceipt(receiptID string) (ShipReceipt, bool) {
	pr.mu.Lock()
	defer pr.mu.Unlock()
	receipt, exists := pr.shipReceipts[receiptID]
	return receipt, exists
}
