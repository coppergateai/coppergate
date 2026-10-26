// Package arena provides memory arena management with lean roster support.
//
// AG-012: Implements lean roster allocation when availableMicros < $2 budget.
// Engineer+reviewer only; no FULL_ARENA spawn under tight budget.
package arena

import (
	"errors"
	"sync"
	"time"
)

// Budget represents a monthly spend envelope in micros.
type Budget struct {
	MonthlyMicros int64
	usedMicros    int64
	mu           sync.Mutex
}

// NewBudget creates a new Budget with given monthly micros.
func NewBudget(micros int64) *Budget {
	return &Budget{MonthlyMicros: micros}
}

// Use attempts to use the given micros from the budget.
// Returns error if budget exceeded.
func (b *Budget) Use(micros int64) error {
	b.mu.Lock()
	defer b.mu.Unlock()
	if b.usedMicros+micros > b.MonthlyMicros {
		return errors.New("budget exceeded")
	}
	b.usedMicros += micros
	return nil
}

// Reset resets the used micros to zero.
// Typically called monthly.
func (b *Budget) Reset() {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.usedMicros = 0
}

// ArenaType defines the type of arena allocation.
type ArenaType int

const (
	// FULL_ARENA is the default full arena allocation.
	FULL_ARENA ArenaType = iota
	// LEAN_ROSTER is a lean roster allocation under tight budget.
	LEAN_ROSTER
)

// Roster represents a lean roster allocation.
type Roster struct {
	entries []string
	mu      sync.Mutex
}

// NewRoster creates a new lean roster with capacity.
func NewRoster(capacity int) *Roster {
	return &Roster{
		entries: make([]string, 0, capacity),
	}
}

// AddEntry adds an entry to the roster.
func (r *Roster) AddEntry(entry string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.entries = append(r.entries, entry)
}

// Entries returns a copy of the roster entries.
func (r *Roster) Entries() []string {
	r.mu.Lock()
	defer r.mu.Unlock()
	cpy := make([]string, len(r.entries))
	copy(cpy, r.entries)
	return cpy
}

// Arena manages memory allocation with budget-aware lean roster.
type Arena struct {
	budget       *Budget
	arenaType    ArenaType
	roster       *Roster
	rosterMaxCap int
}

// NewArena creates a new Arena with given budget and max roster capacity.
func NewArena(budget *Budget, rosterMaxCap int) *Arena {
	a := &Arena{
		budget:       budget,
		rosterMaxCap: rosterMaxCap,
	}
	a.selectArenaType()
	return a
}

// selectArenaType selects arena type based on budget availability.
func (a *Arena) selectArenaType() {
	// If availableMicros under $2 (2,000,000 micros), use lean roster.
	if a.budget.MonthlyMicros <= 2_000_000 {
		a.arenaType = LEAN_ROSTER
		a.roster = NewRoster(a.rosterMaxCap)
	} else {
		a.arenaType = FULL_ARENA
		a.roster = nil
	}
}

// Type returns the current arena type.
func (a *Arena) Type() ArenaType {
	return a.arenaType
}

// AddEntry adds an entry to the arena roster if lean roster is active.
// Returns error if FULL_ARENA or budget exceeded.
func (a *Arena) AddEntry(entry string) error {
	if a.arenaType != LEAN_ROSTER {
		return errors.New("FULL_ARENA spawn disallowed under tight budget")
	}
	// Each entry costs 500 micros (example cost)
	const entryCostMicros = 500
	if err := a.budget.Use(entryCostMicros); err != nil {
		return err
	}
	a.roster.AddEntry(entry)
	return nil
}

// Entries returns the current roster entries or nil if FULL_ARENA.
func (a *Arena) Entries() []string {
	if a.arenaType != LEAN_ROSTER {
		return nil
	}
	return a.roster.Entries()
}
