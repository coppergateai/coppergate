// Package arena provides memory arena allocation with lean roster support.
//
// AG-012: Introduce lean roster allocation mode for low-budget micros under $2 monthly.
// This mode restricts allocation to Engineer+reviewer roles only and disables FULL_ARENA spawn
// under tight budget constraints.
//
// This helps reduce memory footprint and cost while matching architecture acceptance criteria.
//
// Usage:
//   arena := NewArena(LeanRosterMode, budgetCents)
//   ptr := arena.Alloc(size)
//   ...
package arena

import (
	"errors"
	"sync"
)

// Role represents user roles allowed to allocate in lean roster mode.
type Role int

const (
	RoleUnknown Role = iota
	RoleEngineer
	RoleReviewer
	RoleFullArenaSpawn // disallowed under lean roster mode
)

// ArenaMode defines the allocation mode of the arena.
type ArenaMode int

const (
	FullArenaMode ArenaMode = iota
	LeanRosterMode
)

// ErrBudgetExceeded is returned when allocation is disallowed due to budget constraints.
var ErrBudgetExceeded = errors.New("allocation disallowed: budget exceeded or role restricted")

// Arena represents a memory arena with lean roster support.
type Arena struct {
	mode       ArenaMode
	budgetCents int
	role       Role

	mu      sync.Mutex
	allocs  [][]byte
	used    int
	maxSize int
}

// NewArena creates a new Arena with the given mode, budget (in cents), and user role.
// LeanRosterMode restricts allocation to Engineer and Reviewer roles only and disables
// FULL_ARENA spawn under tight budget (< $2).
func NewArena(mode ArenaMode, budgetCents int, role Role) *Arena {
	return &Arena{
		mode:       mode,
		budgetCents: budgetCents,
		role:       role,
		maxSize:    1024 * 1024, // 1MB max for lean roster to keep memory tight
	}
}

// Alloc allocates a byte slice of the given size from the arena.
// Returns ErrBudgetExceeded if allocation is disallowed under lean roster constraints.
func (a *Arena) Alloc(size int) ([]byte, error) {
	a.mu.Lock()
	defer a.mu.Unlock()

	if a.mode == LeanRosterMode {
		// Enforce budget limit under $2 (200 cents)
		if a.budgetCents > 200 {
			// Budget too high for lean roster mode, disallow FULL_ARENA spawn
			return nil, ErrBudgetExceeded
		}
		// Only Engineer and Reviewer roles allowed
		if a.role != RoleEngineer && a.role != RoleReviewer {
			return nil, ErrBudgetExceeded
		}
		// Enforce max size limit
		if a.used+size > a.maxSize {
			return nil, ErrBudgetExceeded
		}
	}

	// Allocate memory slice
	buf := make([]byte, size)
	a.allocs = append(a.allocs, buf)
	a.used += size
	return buf, nil
}

// Used returns the total bytes allocated so far.
func (a *Arena) Used() int {
	a.mu.Lock()
	defer a.mu.Unlock()
	return a.used
}
