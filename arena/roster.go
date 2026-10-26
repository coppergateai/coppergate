package arena

import (
	"errors"
	"sync"
)

// Roster manages a lean set of micros under a tight budget.
// It only allows Engineer+reviewer roles and enforces a $2 per micro monthly cost limit.
// FULL_ARENA spawn is disabled under this tight budget mode.
type Roster struct {
	mu      sync.Mutex
	micros  map[string]*Micro
	budget  float64
	spent   float64
	lean    bool
	maxCost float64
}

// Micro represents a microservice or micro unit in the roster.
type Micro struct {
	ID    string
	Role  Role
	Cost  float64
	Alive bool
}

// Role defines the role of a micro.
type Role int

const (
	RoleUnknown Role = iota
	RoleEngineer
	RoleReviewer
	RoleFullArenaSpawn
)

// ErrBudgetExceeded is returned when adding a micro exceeds the budget.
var ErrBudgetExceeded = errors.New("budget exceeded")

// ErrInvalidRole is returned when a micro role is not allowed in lean roster.
var ErrInvalidRole = errors.New("invalid role for lean roster")

// ErrFullArenaSpawnNotAllowed is returned when FULL_ARENA spawn is attempted under tight budget.
var ErrFullArenaSpawnNotAllowed = errors.New("FULL_ARENA spawn not allowed under tight budget")

// NewLeanRoster creates a new lean roster with $2 max cost per micro and $8 total budget.
func NewLeanRoster() *Roster {
	return &Roster{
		micros:  make(map[string]*Micro),
		budget:  8.0,
		lean:    true,
		maxCost: 2.0,
	}
}

// AddMicro adds a micro to the roster if it meets lean constraints.
func (r *Roster) AddMicro(m *Micro) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	if r.lean {
		// Only Engineer or Reviewer roles allowed.
		if m.Role != RoleEngineer && m.Role != RoleReviewer {
			if m.Role == RoleFullArenaSpawn {
				return ErrFullArenaSpawnNotAllowed
			}
			return ErrInvalidRole
		}
		// Cost per micro must be <= 2
		if m.Cost > r.maxCost {
			return ErrBudgetExceeded
		}
		// Check total budget
		if r.spent+m.Cost > r.budget {
			return ErrBudgetExceeded
		}
	}

	if _, exists := r.micros[m.ID]; exists {
		// Already present, ignore add
		return nil
	}

	r.micros[m.ID] = m
	r.spent += m.Cost
	m.Alive = true
	return nil
}

// RemoveMicro removes a micro from the roster.
func (r *Roster) RemoveMicro(id string) {
	r.mu.Lock()
	defer r.mu.Unlock()

	if m, exists := r.micros[id]; exists {
		r.spent -= m.Cost
		delete(r.micros, id)
		m.Alive = false
	}
}

// ListMicros returns a copy of the current micros.
func (r *Roster) ListMicros() []*Micro {
	r.mu.Lock()
	defer r.mu.Unlock()

	mics := make([]*Micro, 0, len(r.micros))
	for _, m := range r.micros {
		mics = append(mics, m)
	}
	return mics
}
