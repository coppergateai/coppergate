// Package arena provides a lean roster implementation with tight budget constraints.
package arena

import (
	"errors"
	"sync"
)

// ErrBudgetExceeded is returned when the monthly budget envelope is exceeded.
var ErrBudgetExceeded = errors.New("monthly budget envelope exceeded")

// Micros represents microcurrency units.
type Micros int64

// Constants for budget and pricing.
const (
	MonthlyBudgetMicros Micros = 8_000_000 // $8.00 in micros
	EngineerCostMicros  Micros = 2_000_000 // $2.00 in micros
)

// Role defines the role of a roster member.
type Role int

const (
	RoleEngineer Role = iota
	RoleReviewer
	RoleFullArena // disallowed under tight budget
)

// Member represents a roster member.
type Member struct {
	ID   string
	Role Role
	Cost Micros
}

// Roster manages a lean set of members under budget constraints.
type Roster struct {
	members map[string]Member
	budget  Micros
	spent   Micros
	mu      sync.Mutex
}

// NewLeanRoster creates a new roster with a tight $8 monthly budget envelope.
func NewLeanRoster() *Roster {
	return &Roster{
		members: make(map[string]Member),
		budget:  MonthlyBudgetMicros,
		spent:   0,
	}
}

// AddMember adds a member to the roster if it fits the budget and role constraints.
// Only Engineer and Reviewer roles allowed; no FullArena under tight budget.
func (r *Roster) AddMember(id string, role Role) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	if role == RoleFullArena {
		return errors.New("FULL_ARENA spawn disallowed under tight budget")
	}

	cost := EngineerCostMicros
	if role == RoleReviewer {
		cost = EngineerCostMicros // same cost for reviewer and engineer
	}

	if r.spent+cost > r.budget {
		return ErrBudgetExceeded
	}

	r.members[id] = Member{
		ID:   id,
		Role: role,
		Cost: cost,
	}
	r.spent += cost
	return nil
}

// RemoveMember removes a member by ID and refunds their cost.
func (r *Roster) RemoveMember(id string) {
	r.mu.Lock()
	defer r.mu.Unlock()

	if m, ok := r.members[id]; ok {
		r.spent -= m.Cost
		delete(r.members, id)
	}
}

// Members returns a copy of current members.
func (r *Roster) Members() []Member {
	r.mu.Lock()
	defer r.mu.Unlock()

	members := make([]Member, 0, len(r.members))
	for _, m := range r.members {
		members = append(members, m)
	}
	return members
}
