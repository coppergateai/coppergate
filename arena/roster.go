// Package arena provides a lean roster implementation with tight budget constraints.
package arena

import (
	"errors"
	"sync"
)

// ErrBudgetExceeded is returned when the monthly budget envelope is exceeded.
var ErrBudgetExceeded = errors.New("monthly budget envelope exceeded")

// ErrFullArenaSpawnNotAllowed is returned when a full arena spawn is attempted under tight budget.
var ErrFullArenaSpawnNotAllowed = errors.New("full arena spawn not allowed under tight budget")

// Roster represents a lean roster of micros under a budget envelope.
type Roster struct {
	mu       sync.Mutex
	micros   map[string]*Micro
	budget   float64 // monthly budget envelope in dollars
	spent    float64
	allowFullArena bool
}

// Micro represents a microservice or micro unit in the roster.
type Micro struct {
	ID       string
	Cost     float64 // cost per month in dollars
	Role     string  // e.g. "Engineer", "Reviewer"
	FullArena bool   // whether this micro requires full arena spawn
}

// NewRoster creates a new lean roster with the given monthly budget envelope.
// If allowFullArena is false, full arena spawns are disallowed.
func NewRoster(monthlyBudget float64, allowFullArena bool) *Roster {
	return &Roster{
		micros:   make(map[string]*Micro),
		budget:   monthlyBudget,
		allowFullArena: allowFullArena,
	}
}

// AddMicro attempts to add a micro to the roster.
// It enforces the budget envelope and disallows full arena spawns if configured.
// Only micros with role "Engineer" or "Reviewer" are allowed.
// Micros costing $2 or more are rejected.
func (r *Roster) AddMicro(m *Micro) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	if m.Cost >= 2.0 {
		return errors.New("micro cost exceeds $2 limit")
	}
	if m.Role != "Engineer" && m.Role != "Reviewer" {
		return errors.New("micro role not allowed; only Engineer or Reviewer allowed")
	}
	if m.FullArena && !r.allowFullArena {
		return ErrFullArenaSpawnNotAllowed
	}
	if r.spent+m.Cost > r.budget {
		return ErrBudgetExceeded
	}

	r.micros[m.ID] = m
	r.spent += m.Cost
	return nil
}

// RemoveMicro removes a micro from the roster by ID.
func (r *Roster) RemoveMicro(id string) {
	r.mu.Lock()
	defer r.mu.Unlock()

	if m, ok := r.micros[id]; ok {
		r.spent -= m.Cost
		delete(r.micros, id)
	}
}

// ListMicros returns a snapshot list of all micros in the roster.
func (r *Roster) ListMicros() []*Micro {
	r.mu.Lock()
	defer r.mu.Unlock()

	result := make([]*Micro, 0, len(r.micros))
	for _, m := range r.micros {
		result = append(result, m)
	}
	return result
}
