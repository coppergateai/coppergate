package roster

import (
	"errors"
	"sync"
)

// MicroCost represents the cost of a micro unit in microdollars.
type MicroCost int64

const (
	// MaxMonthlyBudgetMicro is the monthly budget envelope in microdollars ($8 = 8,000,000 microdollars).
	MaxMonthlyBudgetMicro MicroCost = 8_000_000

	// MaxMicroCostPerUnit is the max allowed micro cost per unit for lean roster eligibility ($2 = 2,000,000 microdollars).
	MaxMicroCostPerUnit MicroCost = 2_000_000
)

// Role defines the role of a roster member.
type Role string

const (
	RoleEngineer Role = "Engineer"
	RoleReviewer Role = "Reviewer"
)

// SpawnType defines the type of spawn for a roster member.
type SpawnType string

const (
	SpawnLeanArena SpawnType = "LEAN_ARENA"
	SpawnFullArena SpawnType = "FULL_ARENA"
)

// Member represents a roster member.
type Member struct {
	ID        string
	Role      Role
	MicroCost MicroCost
	Spawn     SpawnType
}

// LeanRoster manages a roster with lean arena spawn under budget constraints.
type LeanRoster struct {
	members []Member
	mu      sync.RWMutex
}

// NewLeanRoster creates a new LeanRoster.
func NewLeanRoster() *LeanRoster {
	return &LeanRoster{
		members: []Member{},
	}
}

// AddMember adds a member to the roster if they meet the lean criteria.
// Returns error if member does not meet criteria or budget exceeded.
func (lr *LeanRoster) AddMember(m Member) error {
	if m.MicroCost > MaxMicroCostPerUnit {
		return errors.New("member micro cost exceeds $2 limit")
	}
	if m.Role != RoleEngineer && m.Role != RoleReviewer {
		return errors.New("member role not allowed for lean roster")
	}
	if m.Spawn == SpawnFullArena {
		return errors.New("FULL_ARENA spawn not allowed under tight budget")
	}

	lr.mu.Lock()
	defer lr.mu.Unlock()

	if lr.totalCost()+m.MicroCost > MaxMonthlyBudgetMicro {
		return errors.New("adding member exceeds monthly budget envelope")
	}

	lr.members = append(lr.members, m)
	return nil
}

// Members returns a copy of the current members.
func (lr *LeanRoster) Members() []Member {
	lr.mu.RLock()
	defer lr.mu.RUnlock()
	cpy := make([]Member, len(lr.members))
	copy(cpy, lr.members)
	return cpy
}

// totalCost returns the total micro cost of all members.
func (lr *LeanRoster) totalCost() MicroCost {
	var total MicroCost
	for _, m := range lr.members {
		total += m.MicroCost
	}
	return total
}
