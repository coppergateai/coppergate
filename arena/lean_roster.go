package arena

import (
	"errors"
	"sync"
)

// LeanRoster manages a minimal set of micros under a tight budget.
// It only allows Engineer+reviewer roles and prevents FULL_ARENA spawn.
// Designed for monthly budget envelope of $8 and micros under $2 each.
type LeanRoster struct {
	mu      sync.Mutex
	micros  map[string]*Micro
	budget  float64
	spent   float64
	maxCost float64
}

// Micro represents a microservice or micro unit with cost and role.
type Micro struct {
	ID    string
	Cost  float64
	Role  Role
	Alive bool
}

// Role defines the role of a micro.
type Role int

const (
	RoleUnknown Role = iota
	RoleEngineer
	RoleReviewer
	RoleFullArena // disallowed in lean roster
)

var (
	ErrBudgetExceeded   = errors.New("budget exceeded")
	ErrRoleNotAllowed   = errors.New("role not allowed in lean roster")
	ErrFullArenaDisallow = errors.New("FULL_ARENA spawn disallowed under tight budget")
)

// NewLeanRoster creates a new lean roster with given monthly budget envelope and max micro cost.
func NewLeanRoster(monthlyBudget float64, maxMicroCost float64) *LeanRoster {
	return &LeanRoster{
		micros:  make(map[string]*Micro),
		budget:  monthlyBudget,
		maxCost: maxMicroCost,
	}
}

// AddMicro attempts to add a micro to the lean roster.
// Only Engineer and Reviewer roles allowed.
// Reject FULL_ARENA role.
// Reject if cost exceeds maxMicroCost or budget exceeded.
func (lr *LeanRoster) AddMicro(m *Micro) error {
	lr.mu.Lock()
	defer lr.mu.Unlock()

	if m.Role == RoleFullArena {
		return ErrFullArenaDisallow
	}
	if m.Role != RoleEngineer && m.Role != RoleReviewer {
		return ErrRoleNotAllowed
	}
	if m.Cost > lr.maxCost {
		return ErrBudgetExceeded
	}
	if lr.spent+m.Cost > lr.budget {
		return ErrBudgetExceeded
	}

	if _, exists := lr.micros[m.ID]; exists {
		// Already present, no cost increment
		return nil
	}

	lr.micros[m.ID] = m
	lr.spent += m.Cost
	m.Alive = true
	return nil
}

// RemoveMicro removes a micro from the roster and frees budget.
func (lr *LeanRoster) RemoveMicro(id string) {
	lr.mu.Lock()
	defer lr.mu.Unlock()

	if m, exists := lr.micros[id]; exists {
		delete(lr.micros, id)
		lr.spent -= m.Cost
		m.Alive = false
	}
}

// ListMicros returns a snapshot list of current micros.
func (lr *LeanRoster) ListMicros() []*Micro {
	lr.mu.Lock()
	defer lr.mu.Unlock()

	list := make([]*Micro, 0, len(lr.micros))
	for _, m := range lr.micros {
		list = append(list, m)
	}
	return list
}

// CurrentSpent returns the current spent budget.
func (lr *LeanRoster) CurrentSpent() float64 {
	lr.mu.Lock()
	defer lr.mu.Unlock()
	return lr.spent
}
