// Package arena provides a lean roster management system optimized for
// low-cost micro usage under tight budget constraints.
//
// AG-012: Lean roster implementation for Engineer+reviewer roles only,
// avoiding FULL_ARENA spawn under $2 micros, respecting $8 monthly envelope.
package arena

import (
	"errors"
	"sync"
)

// Role defines the user role in the roster.
type Role string

const (
	RoleEngineer Role = "engineer"
	RoleReviewer Role = "reviewer"
	RoleOther    Role = "other"
)

// ErrBudgetExceeded is returned when the monthly budget envelope is exceeded.
var ErrBudgetExceeded = errors.New("monthly budget envelope exceeded")

// Roster manages a lean set of users under budget constraints.
type Roster struct {
	mu          sync.Mutex
	users       map[string]Role
	microsUsed  int64 // micros used this month
	microsLimit int64 // monthly micros envelope limit
}

// NewRoster creates a new Roster with a given monthly micros envelope limit.
func NewRoster(microsLimit int64) *Roster {
	return &Roster{
		users:       make(map[string]Role),
		microsLimit: microsLimit,
	}
}

// AddUser adds a user with a role to the roster if budget and role constraints allow.
// Only Engineer and Reviewer roles are allowed.
// Each user costs 2 micros per month.
// Returns ErrBudgetExceeded if adding the user would exceed the monthly envelope.
func (r *Roster) AddUser(userID string, role Role) error {
	if role != RoleEngineer && role != RoleReviewer {
		// Reject roles other than engineer or reviewer.
		return nil // silently ignore non-allowed roles, no spawn
	}

	const userMicrosCost = 2

	r.mu.Lock()
	defer r.mu.Unlock()

	if r.microsUsed+userMicrosCost > r.microsLimit {
		return ErrBudgetExceeded
	}

	// If user already present, no additional cost.
	if _, exists := r.users[userID]; exists {
		return nil
	}

	r.users[userID] = role
	r.microsUsed += userMicrosCost
	return nil
}

// RemoveUser removes a user from the roster and frees micros.
func (r *Roster) RemoveUser(userID string) {
	r.mu.Lock()
	defer r.mu.Unlock()

	role, exists := r.users[userID]
	if !exists {
		return
	}

	const userMicrosCost = 2
	delete(r.users, userID)
	r.microsUsed -= userMicrosCost
	if r.microsUsed < 0 {
		r.microsUsed = 0
	}
}

// Users returns a copy of the current roster users.
func (r *Roster) Users() map[string]Role {
	r.mu.Lock()
	defer r.mu.Unlock()

	copyMap := make(map[string]Role, len(r.users))
	for k, v := range r.users {
		copyMap[k] = v
	}
	return copyMap
}

// MicrosUsed returns the current micros used this month.
func (r *Roster) MicrosUsed() int64 {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.microsUsed
}

// MicrosLimit returns the monthly micros envelope limit.
func (r *Roster) MicrosLimit() int64 {
	return r.microsLimit
}
