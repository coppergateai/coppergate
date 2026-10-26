// Package arena provides memory arena management with lean roster support.
//
// AG-012: Implements lean roster allocation under tight budget constraints.
// When availableMicros < $2, only Engineer+reviewer roles are allowed in the roster,
// and FULL_ARENA spawn is disabled to keep memory usage minimal.
//
// This feature helps maintain a lean memory footprint under a strict $8 monthly budget.
package arena

import (
	"errors"
	"fmt"
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

// String returns the string representation of the Role.
func (r Role) String() string {
	switch r {
	case RoleEngineer:
		return "Engineer"
	case RoleReviewer:
		return "Reviewer"
	case RoleFullArena:
		return "FullArena"
	default:
		return "Unknown"
	}
}

// User represents a user in the roster.
type User struct {
	ID   string
	Role Role
}

// Roster manages a list of users with roles.
type Roster struct {
	mu    sync.Mutex
	users []User

	// availableMicros is the available micro budget in dollars * 1e6.
	// For example, $2 = 2_000_000 micros.
	availableMicros int64
}

// NewRoster creates a new Roster with the given availableMicros budget.
func NewRoster(availableMicros int64) *Roster {
	return &Roster{
		users:          make([]User, 0),
		availableMicros: availableMicros,
	}
}

// AddUser adds a user to the roster if allowed under the current budget and rules.
// Returns error if the user role is disallowed or budget exceeded.
func (r *Roster) AddUser(user User) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	// If budget is under $2 (2_000_000 micros), only Engineer and Reviewer allowed.
	if r.availableMicros < 2_000_000 {
		if user.Role == RoleFullArena {
			return fmt.Errorf("FULL_ARENA spawn disallowed under tight budget (<$2)")
		}
	}

	// Enforce roles allowed under lean roster when budget < $2.
	if r.availableMicros < 2_000_000 {
		if user.Role != RoleEngineer && user.Role != RoleReviewer {
			return fmt.Errorf("role %s disallowed under lean roster budget (<$2)", user.Role)
		}
	}

	r.users = append(r.users, user)
	return nil
}

// Users returns a copy of the current users in the roster.
func (r *Roster) Users() []User {
	r.mu.Lock()
	defer r.mu.Unlock()

	cpy := make([]User, len(r.users))
	copy(cpy, r.users)
	return cpy
}

// AvailableMicros returns the current available micro budget.
func (r *Roster) AvailableMicros() int64 {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.availableMicros
}

// SetAvailableMicros updates the available micro budget.
func (r *Roster) SetAvailableMicros(micros int64) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.availableMicros = micros
}

// SpawnArena attempts to spawn a FULL_ARENA if budget allows.
// Returns error if FULL_ARENA spawn is disallowed under the current budget.
func (r *Roster) SpawnArena() error {
	r.mu.Lock()
	defer r.mu.Unlock()

	if r.availableMicros < 2_000_000 {
		return errors.New("FULL_ARENA spawn disallowed under tight budget (<$2)")
	}
	// Simulate spawn logic here (omitted for brevity).
	return nil
}
