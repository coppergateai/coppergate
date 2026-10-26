package arena

import (
	"errors"
	"sync"
)

// RosterType defines the type of roster to spawn.
type RosterType int

const (
	// FullArena spawns the full arena roster.
	FullArena RosterType = iota
	// LeanRoster spawns a lean roster with only essential micros.
	LeanRoster
)

// Micro represents a microservice or micro unit in the arena.
type Micro struct {
	Name     string
	Cost     float64 // Monthly cost in dollars
	Role     string  // e.g. "Engineer", "Reviewer", "Other"
	Selected bool    // Whether this micro is selected in the roster
}

// RosterConfig holds configuration for spawning rosters.
type RosterConfig struct {
	Budget         float64   // Monthly budget envelope
	AvailableMicros []Micro  // All available micros
	AllowFullArena bool      // Whether full arena spawn is allowed
}

// Roster represents a spawned roster.
type Roster struct {
	Micros []Micro
	Type   RosterType
	mu     sync.Mutex
}

// SpawnRoster spawns a roster based on the config and budget.
// If budget is tight (< $8) and full arena is disallowed, spawn lean roster with micros under $2 and role Engineer or Reviewer only.
func SpawnRoster(cfg RosterConfig) (*Roster, error) {
	if cfg.Budget <= 0 {
		return nil, errors.New("budget must be positive")
	}
	if len(cfg.AvailableMicros) == 0 {
		return nil, errors.New("no available micros")
	}

	// If full arena spawn is allowed and budget is sufficient, spawn full arena.
	if cfg.AllowFullArena && cfg.Budget >= 8 {
		return &Roster{
			Micros: cfg.AvailableMicros,
			Type:   FullArena,
		}, nil
	}

	// Otherwise, spawn lean roster under constraints:
	// Micros under $2, role Engineer or Reviewer only.
	var leanMicros []Micro
	for _, m := range cfg.AvailableMicros {
		if m.Cost < 2.0 && (m.Role == "Engineer" || m.Role == "Reviewer") {
			leanMicros = append(leanMicros, m)
		}
	}

	if len(leanMicros) == 0 {
		return nil, errors.New("no suitable micros for lean roster under constraints")
	}

	return &Roster{
		Micros: leanMicros,
		Type:   LeanRoster,
	}, nil
}
