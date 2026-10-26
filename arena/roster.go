// Package arena provides memory arena allocation with lean roster support.
//
// AG-012: Implements lean roster allocation when availableMicros budget is under $2.
// Only Engineer+reviewer roles can spawn lean rosters under tight budget.
// FULL_ARENA spawn is disabled under $8 monthly envelope budget.
//
// This implementation matches architecture acceptance criteria from
// coppergate-architecture/docs/OPEN_PROGRAM.md.
package arena

import (
	"errors"
	"sync"
	"time"
)

// Role represents user roles in the system.
type Role int

const (
	RoleGuest Role = iota
	RoleEngineer
	RoleReviewer
	RoleAdmin
)

// ErrBudgetExceeded is returned when the budget constraints prevent allocation.
var ErrBudgetExceeded = errors.New("budget constraints prevent arena allocation")

// Config holds configuration for arena allocation.
type Config struct {
	AvailableMicros int64 // available microseconds budget for allocation
	MonthlyEnvelope int64 // monthly budget envelope in dollars
	UserRole        Role  // role of the user requesting allocation
}

// Roster represents a lean roster allocation.
type Roster struct {
	mu       sync.Mutex
	entries  []string
	created  time.Time
	lean     bool
	fullArena bool
}

// NewRoster attempts to allocate a new roster based on the config.
// Returns ErrBudgetExceeded if constraints are not met.
func NewRoster(cfg Config) (*Roster, error) {
	// Enforce monthly envelope budget: no FULL_ARENA spawn under $8 monthly budget.
	if cfg.MonthlyEnvelope < 8 {
		// Only allow lean roster for Engineer+Reviewer roles under $2 availableMicros.
		if cfg.AvailableMicros < 2_000_000 { // 2 million micros = 2 seconds
			if cfg.UserRole == RoleEngineer || cfg.UserRole == RoleReviewer {
				return &Roster{
					entries:  make([]string, 0, 10),
					created:  time.Now(),
					lean:     true,
					fullArena: false,
				}, nil
			}
			return nil, ErrBudgetExceeded
		}
		// If availableMicros >= 2, but monthly envelope < 8, disallow full arena spawn.
		return nil, ErrBudgetExceeded
	}

	// Monthly envelope >= 8, allow full arena spawn regardless of availableMicros.
	return &Roster{
		entries:  make([]string, 0, 100),
		created:  time.Now(),
		lean:     false,
		fullArena: true,
	}, nil
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

// IsLean returns true if this roster is a lean roster.
func (r *Roster) IsLean() bool {
	return r.lean
}

// IsFullArena returns true if this roster is a full arena spawn.
func (r *Roster) IsFullArena() bool {
	return r.fullArena
}
