package arena

import (
	"errors"
	"fmt"
	"sync"
)

// Roster manages a set of micros (lightweight units) under a budget constraint.
// It supports a lean mode where only Engineer+Reviewer micros under $2 are allowed,
// and FULL_ARENA spawn is disallowed under tight budget.
type Roster struct {
	mu           sync.Mutex
	micros       map[string]*Micro
	budgetCents  int // monthly budget in cents
	spentCents   int
	leanMode     bool
	maxMicroCost int // max cost per micro allowed in lean mode (cents)
}

// Micro represents a micro unit with role and cost.
type Micro struct {
	ID    string
	Role  Role
	Cost  int // cost in cents
	Spawn SpawnType
}

// Role defines the role of a micro.
type Role string

const (
	RoleEngineer Role = "Engineer"
	RoleReviewer Role = "Reviewer"
	RoleOther    Role = "Other"
)

// SpawnType defines the spawn type of a micro.
type SpawnType string

const (
	SpawnLean     SpawnType = "LEAN"
	SpawnFullArena SpawnType = "FULL_ARENA"
)

// NewRoster creates a new Roster with given monthly budget in cents.
func NewRoster(monthlyBudgetCents int) *Roster {
	leanMode := monthlyBudgetCents <= 800 // $8 envelope triggers lean mode
	return &Roster{
		micros:       make(map[string]*Micro),
		budgetCents:  monthlyBudgetCents,
		leanMode:     leanMode,
		maxMicroCost: 200, // $2 max per micro in lean mode
	}
}

// AddMicro attempts to add a micro to the roster.
// Returns error if constraints are violated.
func (r *Roster) AddMicro(m *Micro) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	if r.leanMode {
		// Enforce lean roster constraints:
		// - Only Engineer or Reviewer roles allowed
		// - Cost must be <= $2 (200 cents)
		// - No FULL_ARENA spawn allowed
		if m.Role != RoleEngineer && m.Role != RoleReviewer {
			return fmt.Errorf("lean mode: only Engineer or Reviewer roles allowed, got %s", m.Role)
		}
		if m.Cost > r.maxMicroCost {
			return fmt.Errorf("lean mode: micro cost %d exceeds max allowed %d cents", m.Cost, r.maxMicroCost)
		}
		if m.Spawn == SpawnFullArena {
			return errors.New("lean mode: FULL_ARENA spawn disallowed under tight budget")
		}
	}

	// Check budget
	if r.spentCents+m.Cost > r.budgetCents {
		return fmt.Errorf("budget exceeded: current spent %d + micro cost %d > budget %d cents",
			r.spentCents, m.Cost, r.budgetCents)
	}

	if _, exists := r.micros[m.ID]; exists {
		return fmt.Errorf("micro with ID %s already exists", m.ID)
	}

	r.micros[m.ID] = m
	r.spentCents += m.Cost
	return nil
}

// RemoveMicro removes a micro by ID.
func (r *Roster) RemoveMicro(id string) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	m, exists := r.micros[id]
	if !exists {
		return fmt.Errorf("micro with ID %s not found", id)
	}
	delete(r.micros, id)
	r.spentCents -= m.Cost
	return nil
}

// ListMicros returns a copy of the current micros.
func (r *Roster) ListMicros() []*Micro {
	r.mu.Lock()
	defer r.mu.Unlock()

	result := make([]*Micro, 0, len(r.micros))
	for _, m := range r.micros {
		result = append(result, m)
	}
	return result
}

// IsLeanMode returns whether the roster is in lean mode.
func (r *Roster) IsLeanMode() bool {
	return r.leanMode
}
