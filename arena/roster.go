package arena

import (
	"errors"
	"sync"
)

// Roster manages a lean set of micros under a tight budget.
// It only allows Engineer+reviewer roles and disallows FULL_ARENA spawns
// when the monthly spend envelope is tight (<= $8).
//
// This implementation enforces:
// - Micros cost under $2 each
// - Only Engineer and Reviewer roles allowed
// - No FULL_ARENA spawn under tight budget
//
// This is the AG-012 lean roster implementation.

const (
	RoleEngineer = "Engineer"
	RoleReviewer = "Reviewer"

	MaxMicroCostUSD = 2.00
	MonthlyBudgetUSD = 8.00
)

var (
	ErrRoleNotAllowed      = errors.New("role not allowed in lean roster")
	ErrCostExceeded        = errors.New("micro cost exceeds max allowed")
	ErrBudgetExceeded      = errors.New("monthly budget exceeded")
	ErrFullArenaNotAllowed = errors.New("FULL_ARENA spawn not allowed under tight budget")
)

type Micro struct {
	ID    string
	Role  string
	Cost  float64 // USD cost per micro
	Spawn string  // spawn type, e.g. "LEAN_ARENA", "FULL_ARENA"
}

type Roster struct {
	mu     sync.Mutex
	micros map[string]Micro
	spend  float64
}

// NewLeanRoster returns a new lean roster enforcing AG-012 constraints.
func NewLeanRoster() *Roster {
	return &Roster{
		micros: make(map[string]Micro),
		spend:  0,
	}
}

// AddMicro attempts to add a micro to the roster.
// Returns error if constraints are violated.
func (r *Roster) AddMicro(m Micro) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	// Validate role
	if m.Role != RoleEngineer && m.Role != RoleReviewer {
		return ErrRoleNotAllowed
	}

	// Validate cost
	if m.Cost > MaxMicroCostUSD {
		return ErrCostExceeded
	}

	// Validate spawn type
	if m.Spawn == "FULL_ARENA" {
		return ErrFullArenaNotAllowed
	}

	// Check if adding this micro exceeds monthly budget
	if r.spend+m.Cost > MonthlyBudgetUSD {
		return ErrBudgetExceeded
	}

	// Add micro
	r.micros[m.ID] = m
	r.spend += m.Cost
	return nil
}

// RemoveMicro removes a micro by ID, reducing spend accordingly.
func (r *Roster) RemoveMicro(id string) {
	r.mu.Lock()
	defer r.mu.Unlock()

	if m, ok := r.micros[id]; ok {
		delete(r.micros, id)
		r.spend -= m.Cost
	}
}

// ListMicros returns a copy of current micros in the roster.
func (r *Roster) ListMicros() []Micro {
	r.mu.Lock()
	defer r.mu.Unlock()

	mics := make([]Micro, 0, len(r.micros))
	for _, m := range r.micros {
		mics = append(mics, m)
	}
	return mics
}

// CurrentSpend returns the current total spend of the roster.
func (r *Roster) CurrentSpend() float64 {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.spend
}
