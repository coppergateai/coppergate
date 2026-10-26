package arena

import (
	"errors"
	"sync"
)

// LeanRoster manages a minimal set of micros under a tight budget.
// It only allows Engineer and Reviewer roles, and disallows FULL_ARENA spawns.
type LeanRoster struct {
	mu     sync.Mutex
	micros map[string]*Micro
	budget float64 // monthly budget envelope in dollars
	spent  float64
}

// Micro represents a minimal unit with role and cost.
type Micro struct {
	ID   string
	Role Role
	Cost float64
}

// Role defines allowed roles for micros.
type Role string

const (
	RoleEngineer Role = "Engineer"
	RoleReviewer Role = "Reviewer"
	RoleFullArena Role = "FULL_ARENA"
)

// NewLeanRoster creates a new LeanRoster with given budget envelope.
func NewLeanRoster(budget float64) *LeanRoster {
	return &LeanRoster{
		micros: make(map[string]*Micro),
		budget: budget,
	}
}

// AddMicro attempts to add a micro to the roster.
// Returns error if role is disallowed, cost exceeds budget, or ID duplicate.
func (lr *LeanRoster) AddMicro(m *Micro) error {
	lr.mu.Lock()
	defer lr.mu.Unlock()

	if m.Role != RoleEngineer && m.Role != RoleReviewer {
		return errors.New("disallowed role: only Engineer and Reviewer allowed in lean roster")
	}
	if m.Cost > 2.0 {
		return errors.New("micro cost exceeds $2 limit")
	}
	if lr.spent+m.Cost > lr.budget {
		return errors.New("budget exceeded")
	}
	if _, exists := lr.micros[m.ID]; exists {
		return errors.New("micro ID already exists")
	}

	lr.micros[m.ID] = m
	lr.spent += m.Cost
	return nil
}

// RemoveMicro removes a micro by ID, freeing budget.
func (lr *LeanRoster) RemoveMicro(id string) {
	lr.mu.Lock()
	defer lr.mu.Unlock()

	if m, exists := lr.micros[id]; exists {
		delete(lr.micros, id)
		lr.spent -= m.Cost
	}
}

// GetMicros returns a snapshot list of current micros.
func (lr *LeanRoster) GetMicros() []*Micro {
	lr.mu.Lock()
	defer lr.mu.Unlock()

	result := make([]*Micro, 0, len(lr.micros))
	for _, m := range lr.micros {
		result = append(result, m)
	}
	return result
}

// TotalSpent returns the current spent budget.
func (lr *LeanRoster) TotalSpent() float64 {
	lr.mu.Lock()
	defer lr.mu.Unlock()
	return lr.spent
}
