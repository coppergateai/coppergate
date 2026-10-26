package arena

import (
	"errors"
	"sync"
)

// LeanRoster manages a minimal set of micros under a tight budget.
// It only allows Engineer and Reviewer roles, and enforces a $2 per micro cost limit.
// It avoids spawning FULL_ARENA micros under the $8 monthly envelope.
type LeanRoster struct {
	mu     sync.Mutex
	micros map[string]*Micro
	budget float64 // monthly budget envelope, e.g. $8
	spent  float64
}

// Micro represents a minimal microservice instance with role and cost.
type Micro struct {
	ID   string
	Role Role
	Cost float64
}

// Role defines the micro role type.
type Role string

const (
	RoleEngineer Role = "Engineer"
	RoleReviewer Role = "Reviewer"
	RoleFullArena Role = "FULL_ARENA"
)

var (
	ErrRoleNotAllowed    = errors.New("role not allowed in lean roster")
	ErrCostExceedsLimit  = errors.New("micro cost exceeds $2 limit")
	ErrBudgetExceeded    = errors.New("monthly budget exceeded")
	ErrMicroExists       = errors.New("micro with given ID already exists")
	ErrMicroNotFound     = errors.New("micro not found")
)

// NewLeanRoster creates a new LeanRoster with the given monthly budget envelope.
func NewLeanRoster(monthlyBudget float64) *LeanRoster {
	return &LeanRoster{
		micros: make(map[string]*Micro),
		budget: monthlyBudget,
	}
}

// AddMicro attempts to add a micro to the lean roster.
// Returns error if role or cost constraints are violated or budget exceeded.
func (lr *LeanRoster) AddMicro(m *Micro) error {
	lr.mu.Lock()
	defer lr.mu.Unlock()

	if m.Role != RoleEngineer && m.Role != RoleReviewer {
		return ErrRoleNotAllowed
	}
	if m.Cost > 2.0 {
		return ErrCostExceedsLimit
	}
	if _, exists := lr.micros[m.ID]; exists {
		return ErrMicroExists
	}
	if lr.spent+m.Cost > lr.budget {
		return ErrBudgetExceeded
	}

	lr.micros[m.ID] = m
	lr.spent += m.Cost
	return nil
}

// RemoveMicro removes a micro by ID and refunds its cost.
func (lr *LeanRoster) RemoveMicro(id string) error {
	lr.mu.Lock()
	defer lr.mu.Unlock()

	m, exists := lr.micros[id]
	if !exists {
		return ErrMicroNotFound
	}
	delete(lr.micros, id)
	lr.spent -= m.Cost
	return nil
}

// ListMicros returns a copy of the current micros in the roster.
func (lr *LeanRoster) ListMicros() []*Micro {
	lr.mu.Lock()
	defer lr.mu.Unlock()

	result := make([]*Micro, 0, len(lr.micros))
	for _, m := range lr.micros {
		result = append(result, m)
	}
	return result
}

// TotalSpent returns the total spent cost of current micros.
func (lr *LeanRoster) TotalSpent() float64 {
	lr.mu.Lock()
	defer lr.mu.Unlock()
	return lr.spent
}
