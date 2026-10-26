// Package arena provides memory arena management with lean roster support.
//
// AG-012: Implements lean roster allocation for availableMicros under $2 budget.
// When budget is tight, no FULL_ARENA spawn is allowed; only lean roster with
// engineer+reviewer roles is permitted.
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
	RoleOther
)

// User represents a user in the roster.
type User struct {
	ID   string
	Role Role
}

// Roster manages a set of users assigned to an arena.
type Roster struct {
	mu    sync.Mutex
	users map[string]User
}

// NewRoster creates a new empty roster.
func NewRoster() *Roster {
	return &Roster{
		users: make(map[string]User),
	}
}

// AddUser adds a user to the roster.
func (r *Roster) AddUser(u User) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.users[u.ID] = u
}

// RemoveUser removes a user from the roster.
func (r *Roster) RemoveUser(userID string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	delete(r.users, userID)
}

// HasEngineerAndReviewer returns true if the roster contains at least one engineer and one reviewer.
func (r *Roster) HasEngineerAndReviewer() bool {
	r.mu.Lock()
	defer r.mu.Unlock()
	hasEngineer := false
	hasReviewer := false
	for _, u := range r.users {
		if u.Role == RoleEngineer {
			hasEngineer = true
		}
		if u.Role == RoleReviewer {
			hasReviewer = true
		}
		if hasEngineer && hasReviewer {
			return true
		}
	}
	return false
}

// Count returns the number of users in the roster.
func (r *Roster) Count() int {
	r.mu.Lock()
	defer r.mu.Unlock()
	return len(r.users)
}

// Arena represents a memory arena with a roster and budget constraints.
type Arena struct {
	mu             sync.Mutex
	roster         *Roster
	availableMicros int64 // microseconds available budget
	spawnedFull    bool  // whether a full arena has been spawned
}

// ErrBudgetExceeded is returned when the budget is too tight to spawn a full arena.
var ErrBudgetExceeded = errors.New("budget too tight for full arena spawn")

// NewArena creates a new arena with the given availableMicros budget.
func NewArena(availableMicros int64) *Arena {
	return &Arena{
		roster:         NewRoster(),
		availableMicros: availableMicros,
		spawnedFull:    false,
	}
}

// SpawnFullArena attempts to spawn a full arena if budget allows.
// Returns error if budget is under $2 (2,000 micros) or if already spawned.
func (a *Arena) SpawnFullArena() error {
	a.mu.Lock()
	defer a.mu.Unlock()
	if a.spawnedFull {
		return nil // already spawned
	}
	if a.availableMicros < 2000 {
		// Budget too tight, disallow full arena spawn
		return ErrBudgetExceeded
	}
	// Spawn full arena (simulate)
	a.spawnedFull = true
	return nil
}

// SpawnLeanRoster spawns a lean roster only if it contains engineer+reviewer and budget under $2.
func (a *Arena) SpawnLeanRoster() error {
	a.mu.Lock()
	defer a.mu.Unlock()
	if a.spawnedFull {
		return nil // full arena already spawned, no need for lean roster
	}
	if a.availableMicros >= 2000 {
		// Budget allows full arena, lean roster not needed
		return nil
	}
	if !a.roster.HasEngineerAndReviewer() {
		return errors.New("lean roster requires at least one engineer and one reviewer")
	}
	// Spawn lean roster (simulate)
	// No full arena spawn under tight budget
	return nil
}

// AddUserToRoster adds a user to the arena roster.
func (a *Arena) AddUserToRoster(u User) {
	a.roster.AddUser(u)
}

// RosterCount returns the number of users in the roster.
func (a *Arena) RosterCount() int {
	return a.roster.Count()
}

// SpawnArena attempts to spawn either full arena or lean roster depending on budget and roster.
func (a *Arena) SpawnArena() error {
	if a.availableMicros >= 2000 {
		return a.SpawnFullArena()
	}
	return a.SpawnLeanRoster()
}

// AvailableMicros returns the current available microseconds budget.
func (a *Arena) AvailableMicros() int64 {
	a.mu.Lock()
	defer a.mu.Unlock()
	return a.availableMicros
}

// SetAvailableMicros sets the available microseconds budget.
func (a *Arena) SetAvailableMicros(micros int64) {
	a.mu.Lock()
	defer a.mu.Unlock()
	a.availableMicros = micros
}
