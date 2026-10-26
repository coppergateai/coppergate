package arena

import (
	"errors"
	"sync"
)

// Roster manages a set of micros (lightweight workers) under a budget constraint.
// It supports a lean mode that restricts micros to Engineer+Reviewer roles only,
// disallowing FULL_ARENA spawn under tight budget conditions.
type Roster struct {
	mu          sync.Mutex
	micros      map[string]*Micro
	budgetCents int // monthly budget in cents
	spentCents  int
	leanMode    bool
}

// MicroRole defines the role of a micro.
type MicroRole int

const (
	RoleEngineer MicroRole = iota
	RoleReviewer
	RoleFullArena
)

func (r MicroRole) String() string {
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

// Micro represents a lightweight worker with a role and cost.
type Micro struct {
	ID   string
	Role MicroRole
	Cost int // cost in cents per month
}

// NewRoster creates a new Roster with a given monthly budget in cents.
func NewRoster(budgetCents int) *Roster {
	return &Roster{
		micros:      make(map[string]*Micro),
		budgetCents: budgetCents,
		leanMode:    false,
	}
}

// EnableLeanMode enables lean mode if the budget is tight (<= $8).
// Lean mode restricts micros to Engineer+Reviewer roles only and disallows FULL_ARENA spawn.
func (r *Roster) EnableLeanMode() {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.budgetCents <= 800 {
		r.leanMode = true
	}
}

// AddMicro attempts to add a micro to the roster.
// Returns error if adding the micro violates lean mode or budget constraints.
func (r *Roster) AddMicro(m *Micro) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	if r.leanMode && m.Role == RoleFullArena {
		return errors.New("FULL_ARENA spawn disallowed under lean mode")
	}

	if m.Cost > 200 {
		return errors.New("micro cost exceeds $2 limit")
	}

	if r.spentCents+m.Cost > r.budgetCents {
		return errors.New("budget exceeded")
	}

	r.micros[m.ID] = m
	r.spentCents += m.Cost
	return nil
}

// RemoveMicro removes a micro by ID from the roster.
func (r *Roster) RemoveMicro(id string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if m, ok := r.micros[id]; ok {
		r.spentCents -= m.Cost
		delete(r.micros, id)
	}
}

// Micros returns a copy of the current micros.
func (r *Roster) Micros() []*Micro {
	r.mu.Lock()
	defer r.mu.Unlock()
	result := make([]*Micro, 0, len(r.micros))
	for _, m := range r.micros {
		result = append(result, m)
	}
	return result
}

// IsLeanMode returns whether lean mode is enabled.
func (r *Roster) IsLeanMode() bool {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.leanMode
}
