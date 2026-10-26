package program

import (
	"errors"
	"fmt"
	"sync"
)

// Constants for spend limits
const (
	MonthlyEnvelope = 8
)

// IDBadge represents an authorization badge for an agent.
type IDBadge struct {
	AgentID string
	Amount  int
}

// ShipReceipt represents a confirmation of accepted spend license.
type ShipReceipt struct {
	AgentID string
	Amount  int
}

// Runtime manages the contracted autonomy spend license state.
type Runtime struct {
	mu             sync.Mutex
	reserved       int
	badges         map[string]*IDBadge
	shipReceipts   map[string]*ShipReceipt
	totalFanOut    int
}

// NewRuntime creates a new Runtime instance.
func NewRuntime() *Runtime {
	return &Runtime{
		badges:       make(map[string]*IDBadge),
		shipReceipts: make(map[string]*ShipReceipt),
	}
}

// ReserveSpend reserves a portion of the monthly envelope for contracted autonomy.
// Returns error if reservation exceeds monthly envelope.
func (r *Runtime) ReserveSpend(amount int) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	if amount <= 0 {
		return errors.New("reserve amount must be positive")
	}

	if r.reserved+amount > MonthlyEnvelope {
		return fmt.Errorf("reservation exceeds monthly envelope: reserved %d + amount %d > %d", r.reserved, amount, MonthlyEnvelope)
	}

	r.reserved += amount
	return nil
}

// FanOutSpend fans out reserved spend to an agent, issuing an ID badge.
// Returns error if fan-out exceeds reserved amount.
func (r *Runtime) FanOutSpend(agentID string, amount int) (*IDBadge, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	if amount <= 0 {
		return nil, errors.New("fan-out amount must be positive")
	}

	if r.totalFanOut+amount > r.reserved {
		return nil, fmt.Errorf("fan-out exceeds reserved amount: total fan-out %d + amount %d > reserved %d", r.totalFanOut, amount, r.reserved)
	}

	badge := &IDBadge{
		AgentID: agentID,
		Amount:  amount,
	}
	r.badges[agentID] = badge
	r.totalFanOut += amount
	return badge, nil
}

// AcceptSpend accepts a spend license by an agent, generating a Ship Receipt.
// Returns error if agent has no badge or already accepted.
func (r *Runtime) AcceptSpend(agentID string) (*ShipReceipt, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	badge, ok := r.badges[agentID]
	if !ok {
		return nil, fmt.Errorf("no badge found for agent %s", agentID)
	}

	if _, accepted := r.shipReceipts[agentID]; accepted {
		return nil, fmt.Errorf("agent %s already accepted spend license", agentID)
	}

	receipt := &ShipReceipt{
		AgentID: agentID,
		Amount:  badge.Amount,
	}
	r.shipReceipts[agentID] = receipt
	return receipt, nil
}

// GetShipReceipt returns the Ship Receipt for an agent if exists.
func (r *Runtime) GetShipReceipt(agentID string) (*ShipReceipt, bool) {
	r.mu.Lock()
	defer r.mu.Unlock()

	receipt, ok := r.shipReceipts[agentID]
	return receipt, ok
}

// GetReserved returns the total reserved amount.
func (r *Runtime) GetReserved() int {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.reserved
}

// GetTotalFanOut returns the total fan-out amount.
func (r *Runtime) GetTotalFanOut() int {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.totalFanOut
}
