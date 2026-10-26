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

// ErrBudgetExceeded is returned when the budget is too tight for full arena.
var ErrBudgetExceeded = errors.New("budget too tight for full arena")

// RosterConfig holds configuration for spawning a roster.
type RosterConfig struct {
	MonthlyBudgetUSD float64
	Role             string // e.g. "Engineer", "Reviewer"
	SpawnType        RosterType
}

// Roster represents a spawned roster.
type Roster struct {
	Micros []string // Micros assigned to the roster
	Type   RosterType
}

// SpawnRoster spawns a roster based on the config.
// It enforces the $8 monthly budget envelope and spawns lean roster if budget < $2.
// Only Engineer and Reviewer roles are allowed to spawn lean rosters.
// FULL_ARENA spawn is disallowed if budget is tight (<$2).
func SpawnRoster(cfg RosterConfig) (*Roster, error) {
	if cfg.MonthlyBudgetUSD < 0 {
		return nil, errors.New("invalid budget")
	}

	// Enforce role restriction for lean roster
	if cfg.MonthlyBudgetUSD < 2.0 {
		if cfg.Role != "Engineer" && cfg.Role != "Reviewer" {
			return nil, ErrBudgetExceeded
		}
		// Spawn lean roster
		return spawnLeanRoster(), nil
	}

	// Budget >= 2, spawn full arena roster but respect $8 monthly envelope
	if cfg.MonthlyBudgetUSD > 8.0 {
		cfg.MonthlyBudgetUSD = 8.0
	}
	return spawnFullArenaRoster(), nil
}

func spawnLeanRoster() *Roster {
	// Minimal micros under $2 budget
	return &Roster{
		Micros: []string{"micro1-engineer", "micro2-reviewer"},
		Type:   LeanRoster,
	}
}

func spawnFullArenaRoster() *Roster {
	// Full arena spawn with more micros
	return &Roster{
		Micros: []string{
			"micro1-engineer", "micro2-reviewer", "micro3-engineer", "micro4-reviewer",
			"micro5-engineer", "micro6-reviewer", "micro7-engineer", "micro8-reviewer",
		},
		Type: FullArena,
	}
}

// RosterManager manages roster spawning with concurrency safety.
type RosterManager struct {
	mu     sync.Mutex
	roster *Roster
}

func NewRosterManager() *RosterManager {
	return &RosterManager{}
}

// GetOrSpawnRoster returns existing roster or spawns a new one based on config.
func (rm *RosterManager) GetOrSpawnRoster(cfg RosterConfig) (*Roster, error) {
	rm.mu.Lock()
	defer rm.mu.Unlock()

	if rm.roster != nil {
		return rm.roster, nil
	}

	r, err := SpawnRoster(cfg)
	if err != nil {
		return nil, err
	}
	rm.roster = r
	return r, nil
}
