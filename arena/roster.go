package arena

import (
	"errors"
	"sync"
)

// Roster manages a lean set of micros under a tight budget.
// It only allows Engineer+reviewer roles and avoids spawning FULL_ARENA micros when budget is tight.
type Roster struct {
	mu       sync.Mutex
	micros   map[string]*Micro
	budget   float64 // monthly budget envelope in dollars
	spent    float64
	maxBudget float64
}

// Micro represents a microservice or micro instance in the roster.
type Micro struct {
	ID       string
	Role     Role
	Cost     float64
	FullArena bool
}

// Role defines the role of a micro.
type Role string

const (
	RoleEngineer Role = "Engineer"
	RoleReviewer Role = "Reviewer"
	RoleOther    Role = "Other"
)

// NewRoster creates a new Roster with a given monthly budget envelope.
func NewRoster(maxBudget float64) *Roster {
	return &Roster{
		micros:    make(map[string]*Micro),
		maxBudget: maxBudget,
	}
}

// AddMicro attempts to add a micro to the roster.
// It enforces the lean roster policy:
// - Only Engineer or Reviewer roles allowed.
// - No FULL_ARENA spawn if budget is tight (spent + cost > maxBudget).
// - Micros under $2 cost only.
func (r *Roster) AddMicro(m *Micro) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	if m.Cost > 2.0 {
		return errors.New("micro cost exceeds $2 limit")
	}

	if m.Role != RoleEngineer && m.Role != RoleReviewer {
		return errors.New("micro role not allowed in lean roster")
	}

	if m.FullArena {
		return errors.New("FULL_ARENA spawn not allowed under tight budget")
	}

	if r.spent+m.Cost > r.maxBudget {
		return errors.New("budget exceeded, cannot add micro")
	}

	if _, exists := r.micros[m.ID]; exists {
		return errors.New("micro already exists")
	}

	r.micros[m.ID] = m
	r.spent += m.Cost
	return nil
}

// RemoveMicro removes a micro from the roster by ID.
func (r *Roster) RemoveMicro(id string) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	m, exists := r.micros[id]
	if !exists {
		return errors.New("micro not found")
	}

	delete(r.micros, id)
	r.spent -= m.Cost
	return nil
}

// ListMicros returns a copy of all micros in the roster.
func (r *Roster) ListMicros() []*Micro {
	r.mu.Lock()
	defer r.mu.Unlock()

	mics := make([]*Micro, 0, len(r.micros))
	for _, m := range r.micros {
		mics = append(mics, m)
	}
	return mics
}

// CurrentSpent returns the current spent budget.
func (r *Roster) CurrentSpent() float64 {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.spent
}
