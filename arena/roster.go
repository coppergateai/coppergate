// Package arena provides memory arena management with lean roster support.
//
// AG-012: Implements lean roster allocation under tight budget constraints.
// When availableMicros budget is under $2, only Engineer+reviewer roles are allowed,
// and FULL_ARENA spawn is disabled to keep memory usage lean.
package arena

import (
	"errors"
	"sync"
	"time"
)

// Role represents a user role in the roster.
type Role int

const (
	RoleEngineer Role = iota
	RoleReviewer
	RoleFullArena
)

// ErrFullArenaNotAllowed indicates FULL_ARENA spawn is disallowed under budget.
var ErrFullArenaNotAllowed = errors.New("FULL_ARENA spawn disallowed under tight budget")

// RosterEntry represents a single user in the roster.
type RosterEntry struct {
	UserID string
	Role   Role
}

// Roster manages a list of users allocated in the arena.
type Roster struct {
	mu      sync.Mutex
	entries []RosterEntry

	// availableMicros is the current budget in microseconds.
	availableMicros int64
}

// NewRoster creates a new Roster with a given availableMicros budget.
func NewRoster(availableMicros int64) *Roster {
	return &Roster{
		entries:        []RosterEntry{},
		availableMicros: availableMicros,
	}
}

// AddEntry attempts to add a user with a role to the roster.
// Under $2 (2,000,000 micros) budget, only Engineer and Reviewer roles are allowed.
// FULL_ARENA spawn is disallowed under this budget.
func (r *Roster) AddEntry(userID string, role Role) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	if r.availableMicros < 2_000_000 {
		if role == RoleFullArena {
			return ErrFullArenaNotAllowed
		}
		// Only Engineer and Reviewer allowed under tight budget.
		if role != RoleEngineer && role != RoleReviewer {
			return errors.New("role not allowed under tight budget")
		}
	}

	r.entries = append(r.entries, RosterEntry{
		UserID: userID,
		Role:   role,
	})
	return nil
}

// Entries returns a copy of the current roster entries.
func (r *Roster) Entries() []RosterEntry {
	r.mu.Lock()
	defer r.mu.Unlock()
	entriesCopy := make([]RosterEntry, len(r.entries))
	copy(entriesCopy, r.entries)
	return entriesCopy
}

// SetAvailableMicros updates the availableMicros budget.
func (r *Roster) SetAvailableMicros(micros int64) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.availableMicros = micros
}
