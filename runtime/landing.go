package runtime

import (
	"errors"
	"sync"
)

// RuntimeLanding manages landing and writeback of runtime state changes.
type RuntimeLanding struct {
	mu       sync.Mutex
	contracts map[string]*RuntimeContract
}

// NewRuntimeLanding creates a new RuntimeLanding manager.
func NewRuntimeLanding() *RuntimeLanding {
	return &RuntimeLanding{
		contracts: make(map[string]*RuntimeContract),
	}
}

// Land adds or updates a runtime contract in the landing area.
func (rl *RuntimeLanding) Land(contract *RuntimeContract) error {
	if contract == nil {
		return errors.New("contract is nil")
	}

	rl.mu.Lock()
	defer rl.mu.Unlock()

	rl.contracts[contract.ID] = contract
	return nil
}

// Writeback persists the landed contracts to storage.
// For this example, we simulate writeback by clearing the landing area.
func (rl *RuntimeLanding) Writeback() error {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	// Simulate persistence logic here.
	// In a real system, this would write to a database or durable storage.

	// Clear landing after writeback
	rl.contracts = make(map[string]*RuntimeContract)
	return nil
}
