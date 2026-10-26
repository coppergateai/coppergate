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

// ErrBudgetExceeded is returned when the budget is too tight for FullArena.
var ErrBudgetExceeded = errors.New("budget too tight for full arena spawn")

// RosterConfig holds configuration for spawning rosters.
type RosterConfig struct {
	BudgetCents int     // Monthly budget in cents
	MicroCost   float64 // Cost per micro in dollars
	EngineerOnly bool   // Only engineer+reviewer allowed micros
}

// Roster represents a spawned roster.
type Roster struct {
	Type       RosterType
	Micros     int
	EngineerOnly bool
}

// SpawnRoster spawns a roster based on the config and budget.
// Under tight budget (< $8), no FullArena spawn allowed.
// If micros cost under $2 and EngineerOnly is true, spawn LeanRoster.
// Otherwise, spawn FullArena if budget allows.
func SpawnRoster(cfg RosterConfig) (*Roster, error) {
	const (
		fullArenaCostCents = 800 // $8.00
		leanRosterMaxMicroCost = 2.00
	)

	if cfg.BudgetCents < fullArenaCostCents {
		// Budget too tight for full arena spawn
		if cfg.MicroCost <= leanRosterMaxMicroCost && cfg.EngineerOnly {
			// Spawn lean roster
			return &Roster{
				Type:        LeanRoster,
				Micros:      1, // minimal micros
				EngineerOnly: true,
			}, nil
		}
		return nil, ErrBudgetExceeded
	}

	// Budget allows full arena spawn
	return &Roster{
		Type:        FullArena,
		Micros:      10, // default full arena micros count
		EngineerOnly: cfg.EngineerOnly,
	}, nil
}

// RosterManager manages rosters with concurrency safety.
type RosterManager struct {
	mu     sync.Mutex
	roster *Roster
	cfg    RosterConfig
}

// NewRosterManager creates a new RosterManager.
func NewRosterManager(cfg RosterConfig) *RosterManager {
	return &RosterManager{cfg: cfg}
}

// GetOrSpawnRoster returns existing roster or spawns a new one.
func (rm *RosterManager) GetOrSpawnRoster() (*Roster, error) {
	rm.mu.Lock()
	defer rm.mu.Unlock()

	if rm.roster != nil {
		return rm.roster, nil
	}

	r, err := SpawnRoster(rm.cfg)
	if err != nil {
		return nil, err
	}
	rm.roster = r
	return r, nil
}
