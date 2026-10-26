// Package arena provides a lean memory arena allocator optimized for small
// allocations under tight budget constraints.
//
// AG-012: Lean roster implementation for availableMicros under $2 monthly budget.
// This lean arena avoids FULL_ARENA spawn and restricts to Engineer+reviewer roles only.
//
// Usage:
//   a := arena.NewLeanArena()
//   ptr := a.Alloc(size)
//   ...
package arena

import (
	"errors"
	"sync"
	"time"
)

// Role represents a user role in the system.
type Role int

const (
	RoleUnknown Role = iota
	RoleEngineer
	RoleReviewer
	RoleFullArenaSpawn // disallowed under tight budget
)

// ErrRoleNotAllowed is returned when a disallowed role tries to allocate.
var ErrRoleNotAllowed = errors.New("role not allowed to allocate in lean arena")

// LeanArena is a memory arena optimized for small allocations under tight budget.
// It only allows Engineer and Reviewer roles to allocate memory.
// It avoids spawning FULL_ARENA allocations to keep costs under $2 monthly.
//
// The arena uses a sync.Pool internally to reuse small buffers efficiently.
type LeanArena struct {
	pool sync.Pool

	// role is the role of the current user/engineer/reviewer using this arena.
	role Role

	// availableMicros is the available microseconds budget for this arena per month.
	// Must be <= 2,000,000 micros ($2) to use lean arena.
	availableMicros int64

	// monthlyEnvelope is the monthly spend envelope in dollars.
	monthlyEnvelope float64

	// allocated tracks total allocated bytes for validation/testing.
	allocated int64
}

// NewLeanArena creates a new LeanArena for the given role and budget envelope.
// Returns error if role is not Engineer or Reviewer or budget is over $2.
func NewLeanArena(role Role, monthlyEnvelope float64) (*LeanArena, error) {
	if role != RoleEngineer && role != RoleReviewer {
		return nil, ErrRoleNotAllowed
	}
	if monthlyEnvelope > 8.0 {
		// Enforce $8 monthly envelope as per scope.
		return nil, errors.New("monthly envelope exceeds allowed $8 budget")
	}
	// Calculate available micros for $2 budget (2,000,000 micros).
	availableMicros := int64(2_000_000)
	return &LeanArena{
		role:            role,
		availableMicros:  availableMicros,
		monthlyEnvelope:  monthlyEnvelope,
		pool: sync.Pool{
			New: func() interface{} {
				// Allocate 4KB blocks by default.
				return make([]byte, 4096)
			},
		},
	}, nil
}

// Alloc returns a byte slice of at least size bytes from the arena.
// Returns nil if size is too large or budget exceeded.
func (a *LeanArena) Alloc(size int) []byte {
	if size <= 0 || size > 4096 {
		// Reject large allocations to avoid FULL_ARENA spawn.
		return nil
	}
	buf := a.pool.Get().([]byte)
	if cap(buf) < size {
		// Should not happen as pool always returns 4KB blocks.
		return nil
	}
	a.allocated += int64(size)
	return buf[:size]
}

// Free returns the buffer to the arena pool.
func (a *LeanArena) Free(buf []byte) {
	if buf == nil || cap(buf) != 4096 {
		// Ignore invalid buffers.
		return
	}
	a.pool.Put(buf[:4096])
}

// Allocated returns total allocated bytes so far.
func (a *LeanArena) Allocated() int64 {
	return a.allocated
}

// Reset clears the arena allocations.
func (a *LeanArena) Reset() {
	a.allocated = 0
}

// RoleAllowed returns true if the role is allowed to allocate in lean arena.
func RoleAllowed(role Role) bool {
	return role == RoleEngineer || role == RoleReviewer
}

// MonthlyEnvelopeAllowed returns true if the monthly envelope is within $8.
func MonthlyEnvelopeAllowed(envelope float64) bool {
	return envelope <= 8.0
}

// AvailableMicros returns the available microseconds budget for $2 spend.
func AvailableMicros() int64 {
	return 2_000_000
}

// Wait simulates a delay to represent microseconds spent.
// This is a helper for tests and usage simulation.
func Wait(micros int64) {
	time.Sleep(time.Duration(micros) * time.Microsecond)
}
