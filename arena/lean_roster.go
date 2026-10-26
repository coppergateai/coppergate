// Package arena provides memory arena allocation with lean roster support.
//
// AG-012: Implements lean roster allocation for micros under $2 monthly budget.
// Lean roster only spawns Engineer+reviewer roles; no FULL_ARENA spawn under tight budget.
package arena

import (
	"errors"
	"sync"
)

// Role represents user roles in the system.
type Role int

const (
	RoleUnknown Role = iota
	RoleEngineer
	RoleReviewer
	RoleFullArena
)

// ErrBudgetExceeded is returned when the monthly budget is exceeded.
var ErrBudgetExceeded = errors.New("monthly budget exceeded")

// Config holds configuration for arena allocation.
type Config struct {
	MonthlyBudgetCents int // Monthly budget in cents, e.g. 800 for $8.00
}

// RosterEntry represents a single roster allocation.
type RosterEntry struct {
	UserID string
	Role   Role
}

// LeanRoster manages a lean roster allocation under budget constraints.
type LeanRoster struct {
	mu       sync.Mutex
	config   Config
	entries  []RosterEntry
	spentCents int
}

// NewLeanRoster creates a new LeanRoster with the given config.
func NewLeanRoster(cfg Config) *LeanRoster {
	return &LeanRoster{
		config: cfg,
	}
}

// AddEntry attempts to add a roster entry if budget and role constraints allow.
// Micros under $2 monthly budget only allow Engineer and Reviewer roles.
// No FULL_ARENA spawn allowed under tight budget.
func (lr *LeanRoster) AddEntry(userID string, role Role, monthlyCostCents int) error {
	lr.mu.Lock()
	defer lr.mu.Unlock()

	// Reject FULL_ARENA role under tight budget.
	if role == RoleFullArena {
		return errors.New("FULL_ARENA spawn disallowed under tight budget")
	}

	// Reject roles other than Engineer or Reviewer.
	if role != RoleEngineer && role != RoleReviewer {
		return errors.New("role not allowed in lean roster")
	}

	// Check if adding this entry exceeds monthly budget.
	if lr.spentCents+monthlyCostCents > lr.config.MonthlyBudgetCents {
		return ErrBudgetExceeded
	}

	lr.entries = append(lr.entries, RosterEntry{UserID: userID, Role: role})
	lr.spentCents += monthlyCostCents
	return nil
}

// Entries returns a copy of current roster entries.
func (lr *LeanRoster) Entries() []RosterEntry {
	lr.mu.Lock()
	defer lr.mu.Unlock()
	cpy := make([]RosterEntry, len(lr.entries))
	copy(cpy, lr.entries)
	return cpy
}

// Spent returns the total spent cents so far.
func (lr *LeanRoster) Spent() int {
	lr.mu.Lock()
	defer lr.mu.Unlock()
	return lr.spentCents
}
