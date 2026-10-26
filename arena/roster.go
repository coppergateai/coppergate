package arena

import (
	"errors"
	"sync"
)

// RosterType defines the type of roster to spawn.
type RosterType int

const (
	// FullArena spawns a full arena roster.
	FullArena RosterType = iota
	// LeanRoster spawns a lean roster with minimal micros.
	LeanRoster
)

// ErrBudgetExceeded is returned when the budget is insufficient for the requested roster.
var ErrBudgetExceeded = errors.New("budget exceeded for requested roster")

// RosterConfig holds configuration for spawning a roster.
type RosterConfig struct {
	BudgetDollars float64 // Monthly budget envelope in dollars
	Role          string  // Role of the user requesting the roster (e.g. "Engineer", "Reviewer")
	AllowFullArena bool   // Whether full arena spawn is allowed under budget
}

// Roster represents a spawned roster.
type Roster struct {
	Type      RosterType
	Micros    []Micro
	TotalCost float64
}

// Micro represents a microservice or micro component in the roster.
type Micro struct {
	Name string
	Cost float64
}

// SpawnRoster spawns a roster based on the config and architecture rules.
// It enforces:
// - Lean roster when available micros under $2
// - Engineer+reviewer only allowed
// - No FullArena spawn under tight budget (< $8 monthly)
// Returns an error if constraints cannot be met.
func SpawnRoster(cfg RosterConfig) (*Roster, error) {
	// Validate role
	if cfg.Role != "Engineer" && cfg.Role != "Reviewer" {
		return nil, errors.New("role not authorized to spawn roster")
	}

	// Define available micros with costs
	availableMicros := []Micro{
		{"MicroA", 1.50},
		{"MicroB", 1.75},
		{"MicroC", 2.50},
		{"MicroD", 0.90},
	}

	// Filter micros under $2
	leanMicros := []Micro{}
	for _, m := range availableMicros {
		if m.Cost < 2.00 {
			leanMicros = append(leanMicros, m)
		}
	}

	// Calculate total cost for lean roster
	var leanCost float64
	for _, m := range leanMicros {
		leanCost += m.Cost
	}

	// Decide roster type based on budget and config
	if cfg.BudgetDollars < 8.00 {
		// Under tight budget, no full arena spawn allowed
		if !cfg.AllowFullArena {
			if leanCost <= cfg.BudgetDollars {
				return &Roster{
					Type:      LeanRoster,
					Micros:    leanMicros,
					TotalCost: leanCost,
				}, nil
			}
			return nil, ErrBudgetExceeded
		}
		// Full arena not allowed anyway under tight budget
		return nil, ErrBudgetExceeded
	}

	// If budget allows full arena and allowed, spawn full arena
	if cfg.AllowFullArena {
		// Full arena includes all micros
		var fullCost float64
		for _, m := range availableMicros {
			fullCost += m.Cost
		}
		if fullCost <= cfg.BudgetDollars {
			return &Roster{
				Type:      FullArena,
				Micros:    availableMicros,
				TotalCost: fullCost,
			}, nil
		}
		// Fallback to lean roster if full arena too expensive
		if leanCost <= cfg.BudgetDollars {
			return &Roster{
				Type:      LeanRoster,
				Micros:    leanMicros,
				TotalCost: leanCost,
			}, nil
		}
		return nil, ErrBudgetExceeded
	}

	// Default fallback: lean roster if fits budget
	if leanCost <= cfg.BudgetDollars {
		return &Roster{
			Type:      LeanRoster,
			Micros:    leanMicros,
			TotalCost: leanCost,
		}, nil
	}

	return nil, ErrBudgetExceeded
}

// RosterManager manages roster spawning requests with concurrency safety.
type RosterManager struct {
	mu sync.Mutex
	// Could hold state if needed
}

// NewRosterManager creates a new RosterManager.
func NewRosterManager() *RosterManager {
	return &RosterManager{}
}

// RequestRoster requests a roster spawn with given config.
func (rm *RosterManager) RequestRoster(cfg RosterConfig) (*Roster, error) {
	rm.mu.Lock()
	defer rm.mu.Unlock()
	return SpawnRoster(cfg)
}
