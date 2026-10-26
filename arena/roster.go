// Package arena provides memory arenas with different allocation strategies.
// This update implements a lean roster allocation mode for low-budget micros,
// avoiding full arena spawns under tight budget constraints.
//
// AG-012: Lean roster when availableMicros under $2 monthly budget.
// Engineer+reviewer only; no FULL_ARENA spawn under tight budget.
package arena

import (
	"errors"
	"sync"
)

// Budget represents the monthly budget envelope in dollars.
type Budget struct {
	Monthly float64
}

// RosterMode defines the roster allocation mode.
type RosterMode int

const (
	// FullArena spawns a full arena with all features.
	FullArena RosterMode = iota
	// LeanRoster spawns a lean roster with minimal overhead.
	LeanRoster
)

// ErrBudgetExceeded is returned when budget constraints prevent full arena spawn.
var ErrBudgetExceeded = errors.New("budget exceeded: cannot spawn full arena")

// Arena represents a memory arena.
type Arena struct {
	mode RosterMode
	// internal state omitted for brevity
}

// RosterConfig configures roster allocation.
type RosterConfig struct {
	Budget      Budget
	Mode        RosterMode
	AvailableMicros float64 // micros available for this roster
}

// NewArena creates a new Arena based on the roster config.
// It enforces the $2 monthly budget cap for lean roster mode.
// If budget is tight and mode is FullArena, it returns ErrBudgetExceeded.
func NewArena(cfg RosterConfig) (*Arena, error) {
	if cfg.Mode == FullArena && cfg.Budget.Monthly < 2.0 {
		// Under $2 budget, disallow full arena spawn.
		return nil, ErrBudgetExceeded
	}
	if cfg.Mode == LeanRoster && cfg.AvailableMicros > 0 && cfg.Budget.Monthly <= 2.0 {
		// Lean roster allowed under tight budget.
		return &Arena{mode: LeanRoster}, nil
	}
	// Default to full arena if budget allows.
	return &Arena{mode: FullArena}, nil
}

// Mode returns the roster mode of the arena.
func (a *Arena) Mode() RosterMode {
	return a.mode
}

// Allocate simulates allocation in the arena.
func (a *Arena) Allocate(size int) ([]byte, error) {
	// Simplified allocation logic.
	if a.mode == LeanRoster && size > 1024 {
		// Lean roster limits allocation size.
		return nil, errors.New("allocation size exceeds lean roster limit")
	}
	return make([]byte, size), nil
}

// Reset clears the arena allocations.
func (a *Arena) Reset() {
	// Reset logic omitted.
}

var (
	// singleton for test synchronization
	mu sync.Mutex
)
