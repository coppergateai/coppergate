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
	// LeanRoster spawns a lean roster with only engineers and reviewers.
	LeanRoster
)

// ErrBudgetExceeded is returned when the budget is insufficient to spawn a roster.
var ErrBudgetExceeded = errors.New("budget exceeded for roster spawn")

// MicroCost constants for different roles.
const (
	MicroCostEngineer = 2 // $2 per engineer
	MicroCostReviewer = 2 // $2 per reviewer
)

// RosterConfig holds configuration for spawning rosters.
type RosterConfig struct {
	Engineers int
	Reviewers int
	Budget    int // in dollars
}

// Roster represents a spawned roster.
type Roster struct {
	Engineers int
	Reviewers int
	Type      RosterType
}

// SpawnRoster spawns a roster based on the config and budget constraints.
// If budget is under $2, only lean roster with engineers and reviewers is spawned.
// FullArena spawn is disallowed under tight budget.
func SpawnRoster(cfg RosterConfig) (*Roster, error) {
	if cfg.Budget < MicroCostEngineer {
		// Budget too low to spawn any engineer or reviewer
		return nil, ErrBudgetExceeded
	}

	// Calculate cost for lean roster (engineers + reviewers)
	leanCost := (cfg.Engineers + cfg.Reviewers) * MicroCostEngineer
	if leanCost <= cfg.Budget {
		// Spawn lean roster
		return &Roster{
			Engineers: cfg.Engineers,
			Reviewers: cfg.Reviewers,
			Type:      LeanRoster,
		}, nil
	}

	// If budget allows full arena spawn (not lean), but budget is tight, disallow full arena spawn
	// FullArena spawn is not implemented here due to budget constraints
	return nil, ErrBudgetExceeded
}

// RosterManager manages roster spawning with concurrency safety.
type RosterManager struct {
	mu     sync.Mutex
	roster *Roster
}

// NewRosterManager creates a new RosterManager.
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
