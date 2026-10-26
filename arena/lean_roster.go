// Package arena provides memory arena allocation with lean roster support.
//
// AG-012: Implement lean roster allocation under tight budget constraints.
// When availableMicros < $2 and role is Engineer or Reviewer only,
// use lean roster allocation without spawning FULL_ARENA to reduce memory footprint.
//
// This package matches architecture acceptance criteria from coppergate-architecture/docs/OPEN_PROGRAM.md.
package arena

import (
	"errors"
	"sync"
	"time"
)

// Role defines user roles in the system.
type Role int

const (
	RoleUnknown Role = iota
	RoleEngineer
	RoleReviewer
	RoleOther
)

// ErrBudgetExceeded is returned when the monthly budget is exceeded.
var ErrBudgetExceeded = errors.New("monthly budget exceeded")

// Config holds configuration for arena allocation.
type Config struct {
	AvailableMicros int64 // Available budget in microdollars (e.g. 2_000_000 for $2)
	Role           Role  // User role
	MonthlyEnvelope int64 // Monthly budget envelope in microdollars (e.g. 8_000_000 for $8)
}

// Arena represents a memory arena.
type Arena struct {
	mu      sync.Mutex
	roster  *Roster
	lean    bool
	created time.Time
}

// Roster holds allocation metadata.
type Roster struct {
	allocations int
	lean        bool
}

// NewArena creates a new Arena based on the given config.
// Implements lean roster allocation if AvailableMicros < $2 and role is Engineer or Reviewer only.
// Does not spawn FULL_ARENA under tight budget.
func NewArena(cfg Config) (*Arena, error) {
	if cfg.MonthlyEnvelope > 8_000_000 {
		// Enforce $8 monthly envelope max
		return nil, ErrBudgetExceeded
	}

	lean := false
	if cfg.AvailableMicros < 2_000_000 && (cfg.Role == RoleEngineer || cfg.Role == RoleReviewer) {
		lean = true
	}

	a := &Arena{
		roster: &Roster{
			allocations: 0,
			lean:        lean,
		},
		lean:    lean,
		created: time.Now(),
	}

	return a, nil
}

// Allocate simulates an allocation in the arena.
func (a *Arena) Allocate() {
	a.mu.Lock()
	defer a.mu.Unlock()
	a.roster.allocations++
}

// IsLean returns true if the arena uses lean roster allocation.
func (a *Arena) IsLean() bool {
	a.mu.Lock()
	defer a.mu.Unlock()
	return a.roster.lean
}

// Allocations returns the number of allocations made.
func (a *Arena) Allocations() int {
	a.mu.Lock()
	defer a.mu.Unlock()
	return a.roster.allocations
}
