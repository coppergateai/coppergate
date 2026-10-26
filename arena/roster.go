package arena

import (
	"errors"
	"sync"
)

// RosterType defines the type of roster allocation.
type RosterType int

const (
	// FullArena spawns a full arena roster.
	FullArena RosterType = iota
	// LeanRoster spawns a lean roster with micros under $2.
	LeanRoster
)

// ErrBudgetExceeded is returned when the budget is too tight for FullArena.
var ErrBudgetExceeded = errors.New("budget too tight for full arena spawn")

// MemberRole defines the role of a roster member.
type MemberRole string

const (
	Engineer MemberRole = "Engineer"
	Reviewer MemberRole = "Reviewer"
)

// Member represents a roster member.
type Member struct {
	ID    string
	Role  MemberRole
	Micro float64 // cost in dollars
}

// Roster manages a list of members.
type Roster struct {
	members []Member
	mu      sync.RWMutex
}

// NewRoster creates a new empty roster.
func NewRoster() *Roster {
	return &Roster{
		members: make([]Member, 0),
	}
}

// AddMember adds a member to the roster.
func (r *Roster) AddMember(m Member) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.members = append(r.members, m)
}

// Members returns a copy of the current members.
func (r *Roster) Members() []Member {
	r.mu.RLock()
	defer r.mu.RUnlock()
	cpy := make([]Member, len(r.members))
	copy(cpy, r.members)
	return cpy
}

// SpawnRoster returns a roster based on the budget and requested type.
// If budget is <= 8 and requested FullArena, returns ErrBudgetExceeded.
// If budget <= 8, returns a LeanRoster with only Engineer+Reviewer micros under $2.
func SpawnRoster(budget float64, requested RosterType) (*Roster, error) {
	if requested == FullArena && budget <= 8 {
		return nil, ErrBudgetExceeded
	}

	r := NewRoster()

	// For LeanRoster or when budget is tight, spawn only Engineer+Reviewer micros under $2.
	if budget <= 8 || requested == LeanRoster {
		// Simulated lean roster members.
		leanMembers := []Member{
			{ID: "eng1", Role: Engineer, Micro: 1.8},
			{ID: "rev1", Role: Reviewer, Micro: 1.5},
		}
		for _, m := range leanMembers {
			if m.Micro <= 2.0 && (m.Role == Engineer || m.Role == Reviewer) {
				r.AddMember(m)
			}
		}
		return r, nil
	}

	// Otherwise spawn full arena roster (simulated).
	fullMembers := []Member{
		{ID: "eng1", Role: Engineer, Micro: 3.0},
		{ID: "eng2", Role: Engineer, Micro: 3.0},
		{ID: "rev1", Role: Reviewer, Micro: 2.5},
		{ID: "qa1", Role: "QA", Micro: 2.0},
	}
	for _, m := range fullMembers {
		r.AddMember(m)
	}
	return r, nil
}
