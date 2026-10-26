// Package arena provides memory arena allocation with lean roster support.
//
// AG-012: Introduce lean roster allocation mode to reduce memory usage under tight budget.
// When availableMicros budget is under $2 and role is Engineer or Reviewer only,
// the arena avoids spawning FULL_ARENA and uses a lean roster allocation.
//
// This reduces memory footprint and matches architecture acceptance criteria.
//
// Usage:
//   arena := NewArena(config)
//   ptr := arena.Alloc(size)
//   ...
package arena

import (
	"errors"
	"sync"
	"time"
)

// Role represents user role for budget and allocation decisions.
type Role int

const (
	RoleUnknown Role = iota
	RoleEngineer
	RoleReviewer
	RoleOther
)

// Config holds arena configuration parameters.
type Config struct {
	AvailableMicros int64 // Available microseconds budget per month
	Role           Role  // User role
	MonthlyEnvelope int64 // Monthly budget envelope in dollars (cents)
}

// Arena represents a memory arena with lean roster capabilities.
type Arena struct {
	mu       sync.Mutex
	leanMode bool
	allocs   [][]byte
}

// NewArena creates a new Arena instance based on config and budget constraints.
func NewArena(cfg Config) (*Arena, error) {
	if cfg.AvailableMicros <= 0 {
		return nil, errors.New("availableMicros must be positive")
	}
	if cfg.MonthlyEnvelope <= 0 {
		return nil, errors.New("monthlyEnvelope must be positive")
	}

	leanMode := false
	// AG-012: Enable lean roster if availableMicros under $2 and role is Engineer or Reviewer only
	if cfg.AvailableMicros < 2_000_000 && // $2 in micros (assuming 1 micro = 1 cent for example)
		(cfg.Role == RoleEngineer || cfg.Role == RoleReviewer) &&
		cfg.MonthlyEnvelope <= 800 { // $8 monthly envelope in cents
		leanMode = true
	}

	return &Arena{
		leanMode: leanMode,
		allocs:   make([][]byte, 0, 16),
	}, nil
}

// Alloc allocates a byte slice of the given size from the arena.
// In lean mode, allocations are smaller and no FULL_ARENA spawn occurs.
func (a *Arena) Alloc(size int) []byte {
	a.mu.Lock()
	defer a.mu.Unlock()

	if a.leanMode {
		// Lean mode: allocate exact size slices, no pre-allocated big blocks
		b := make([]byte, size)
		a.allocs = append(a.allocs, b)
		return b
	}

	// Normal mode: allocate from a pre-allocated block (simulate FULL_ARENA)
	if len(a.allocs) == 0 || len(a.allocs[len(a.allocs)-1]) < size {
		// Allocate a new big block (simulate FULL_ARENA)
		block := make([]byte, 1024*1024) // 1MB block
		a.allocs = append(a.allocs, block)
	}
	// Return a slice from the last block (simplified)
	block := a.allocs[len(a.allocs)-1]
	if len(block) < size {
		// Should not happen, but fallback
		b := make([]byte, size)
		a.allocs = append(a.allocs, b)
		return b
	}
	b := block[:size]
	a.allocs[len(a.allocs)-1] = block[size:]
	return b
}

// IsLean returns true if the arena is in lean roster mode.
func (a *Arena) IsLean() bool {
	a.mu.Lock()
	defer a.mu.Unlock()
	return a.leanMode
}
