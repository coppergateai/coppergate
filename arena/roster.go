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
	// LeanRoster spawns a lean roster with minimal micros.
	LeanRoster
)

// Config holds configuration for roster spawning.
type Config struct {
	MonthlyBudgetCents int // Monthly budget in cents
	AvailableMicros    int // Number of available micros
	EngineerCount      int // Number of engineers available
	ReviewerCount      int // Number of reviewers available
}

// Roster represents a spawned roster.
type Roster struct {
	Type          RosterType
	Engineers     int
	Reviewers     int
	SpawnedMicros int
}

// SpawnRoster decides and spawns the appropriate roster based on config and budget.
// Returns an error if constraints cannot be met.
func SpawnRoster(cfg Config) (*Roster, error) {
	const (
		microCostCents      = 200  // $2 per micro
		fullArenaCostCents  = 800  // $8 monthly envelope for full arena
		minEngineerCount    = 1
		minReviewerCount    = 1
	)

	if cfg.MonthlyBudgetCents < fullArenaCostCents {
		// Tight budget: no full arena spawn allowed
		// Check if lean roster can be spawned
		if cfg.AvailableMicros <= 0 {
			return nil, errors.New("no micros available for lean roster")
		}
		if cfg.AvailableMicros*microCostCents > cfg.MonthlyBudgetCents {
			return nil, errors.New("budget too low for available micros")
		}
		if cfg.EngineerCount < minEngineerCount || cfg.ReviewerCount < minReviewerCount {
			return nil, errors.New("insufficient engineer or reviewer count for lean roster")
		}
		// Spawn lean roster with available micros under $2 each
		return &Roster{
			Type:          LeanRoster,
			Engineers:     cfg.EngineerCount,
			Reviewers:     cfg.ReviewerCount,
			SpawnedMicros: cfg.AvailableMicros,
		}, nil
	}

	// Budget allows full arena spawn
	return &Roster{
		Type:          FullArena,
		Engineers:     cfg.EngineerCount,
		Reviewers:     cfg.ReviewerCount,
		SpawnedMicros: cfg.AvailableMicros,
	}, nil
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

// UpdateRoster updates the roster based on config.
func (rm *RosterManager) UpdateRoster(cfg Config) error {
	rm.mu.Lock()
	defer rm.mu.Unlock()

	r, err := SpawnRoster(cfg)
	if err != nil {
		return err
	}
	rm.roster = r
	return nil
}

// GetRoster returns the current roster.
func (rm *RosterManager) GetRoster() *Roster {
	rm.mu.Lock()
	defer rm.mu.Unlock()
	return rm.roster
}
