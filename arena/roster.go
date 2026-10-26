package arena

import (
	"errors"
	"sync"
)

// RosterType defines the type of roster allocation.
type RosterType int

const (
	// FullArena spawns a full arena roster.
	FullArena RosterType = iota
	// LeanRoster spawns a lean roster with micros under $2.
	LeanRoster
)

// ErrBudgetExceeded is returned when the budget is too tight for FullArena.
var ErrBudgetExceeded = errors.New("budget too tight for FullArena roster")

// Micro represents a microservice or micro unit with cost.
type Micro struct {
	Name  string
	Cost  float64 // Cost in dollars
	Role  string  // e.g. "Engineer", "Reviewer"
}

// RosterConfig holds configuration for roster creation.
type RosterConfig struct {
	BudgetMonthly float64
	AllowFullArena bool
}

// Roster holds the allocated micros.
type Roster struct {
	Micros []Micro
	mu     sync.Mutex
}

// NewRoster creates a roster based on the config and available micros.
// It returns ErrBudgetExceeded if FullArena is requested but budget is too tight.
func NewRoster(config RosterConfig, availableMicros []Micro, rosterType RosterType) (*Roster, error) {
	r := &Roster{}

	switch rosterType {
	case FullArena:
		if !config.AllowFullArena {
			return nil, ErrBudgetExceeded
		}
		// FullArena spawns all available micros regardless of cost.
		r.Micros = append(r.Micros, availableMicros...)
	case LeanRoster:
		// LeanRoster includes only micros under $2 and role Engineer or Reviewer.
		for _, m := range availableMicros {
			if m.Cost < 2.0 && (m.Role == "Engineer" || m.Role == "Reviewer") {
				r.Micros = append(r.Micros, m)
			}
		}
	default:
		return nil, errors.New("unknown roster type")
	}

	return r, nil
}

// Count returns the number of micros in the roster.
func (r *Roster) Count() int {
	r.mu.Lock()
	defer r.mu.Unlock()
	return len(r.Micros)
}
