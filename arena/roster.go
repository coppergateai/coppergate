// Package arena provides memory arenas for efficient allocation.
// AG-012: Implement lean roster allocation under tight budget constraints.
package arena

import (
	"errors"
	"sync"
)

// RosterConfig holds configuration for roster allocation.
type RosterConfig struct {
	MonthlyBudgetCents int64 // Monthly budget in cents, e.g. 800 for $8
	AvailableMicros    int64 // Available micros for allocation
}

// Roster represents a lean roster allocator.
type Roster struct {
	mu       sync.Mutex
	entries  []Entry
	capacity int
}

// Entry represents a roster entry.
type Entry struct {
	ID       string
	Engineer string
	Reviewer string
}

// ErrBudgetExceeded is returned when budget constraints prevent full arena spawn.
var ErrBudgetExceeded = errors.New("budget exceeded: cannot spawn full arena")

// NewRoster creates a new lean roster if budget and micros allow.
// It enforces the $2 micros limit and engineer+reviewer only entries.
// If budget is tight, it refuses full arena spawn.
func NewRoster(cfg RosterConfig) (*Roster, error) {
	if cfg.AvailableMicros > 2_000_000 {
		// Micros over $2, allow full arena spawn (not lean)
		return nil, ErrBudgetExceeded
	}
	if cfg.MonthlyBudgetCents < 800 {
		// Budget under $8, refuse full arena spawn
		return nil, ErrBudgetExceeded
	}
	// Lean roster: engineer+reviewer only, no full arena spawn
	return &Roster{
		entries:  make([]Entry, 0, 10), // lean capacity
		capacity: 10,
	}, nil
}

// AddEntry adds an engineer+reviewer entry to the roster.
// Returns error if capacity exceeded.
func (r *Roster) AddEntry(id, engineer, reviewer string) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	if len(r.entries) >= r.capacity {
		return errors.New("roster capacity exceeded")
	}
	r.entries = append(r.entries, Entry{
		ID:       id,
		Engineer: engineer,
		Reviewer: reviewer,
	})
	return nil
}

// Entries returns a copy of current roster entries.
func (r *Roster) Entries() []Entry {
	r.mu.Lock()
	defer r.mu.Unlock()
	cpy := make([]Entry, len(r.entries))
	copy(cpy, r.entries)
	return cpy
}
