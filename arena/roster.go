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
	Cost     float64
	Role     string // e.g. "Engineer", "Reviewer", "Other"
	FullSpawn bool  // true if this micro requires full arena spawn
}

// Config holds configuration for roster spawning.
type Config struct {
	BudgetMonthly float64
	AllowedRoles  map[string]bool
	MaxMicroCost  float64
}

// Roster holds the spawned micros.
type Roster struct {
	Micros []Micro
	mu     sync.Mutex
}

// SpawnRoster spawns a roster based on the config and budget.
// It returns a lean roster if budget is tight and micros are under cost threshold,
// only including Engineer and Reviewer roles, and excludes full arena spawn micros.
func SpawnRoster(availableMicros []Micro, cfg Config) (Roster, RosterType, error) {
	if cfg.BudgetMonthly < 0 {
		return Roster{}, FullArena, errors.New("invalid budget")
	}

	// Determine if lean roster conditions are met:
	// - Budget <= $8 monthly envelope (tight budget)
	// - Micros cost under $2 each
	// - Only Engineer and Reviewer roles allowed
	// - No full arena spawn micros included
	if cfg.BudgetMonthly <= 8 {
		leanMicros := []Micro{}
		for _, m := range availableMicros {
			if m.Cost <= cfg.MaxMicroCost &&
				cfg.AllowedRoles[m.Role] &&
				!m.FullSpawn {
				leanMicros = append(leanMicros, m)
			}
		}
		if len(leanMicros) > 0 {
			return Roster{Micros: leanMicros}, LeanRoster, nil
		}
	}

	// Otherwise spawn full arena roster
	return Roster{Micros: availableMicros}, FullArena, nil
}
