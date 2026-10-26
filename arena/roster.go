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

// Config holds configuration for roster spawning.
type Config struct {
	MonthlyBudgetCents int64 // Monthly budget in cents
	AvailableMicros    int64 // Micros available for this roster spawn
	Role               string
}

// ErrBudgetExceeded is returned when budget is too tight for full arena.
var ErrBudgetExceeded = errors.New("budget too tight for full arena spawn")

// Roster represents a spawned roster.
type Roster struct {
	Type      RosterType
	Micros    int64
	Role      string
	SpawnedAt int64 // Unix timestamp for spawn time (optional)
}

// SpawnRoster decides which roster to spawn based on config and budget.
func SpawnRoster(cfg Config) (*Roster, error) {
	// Enforce $8 monthly budget envelope (800 cents)
	if cfg.MonthlyBudgetCents > 800 {
		// Over budget, fallback to lean roster
		return spawnLeanRoster(cfg)
	}

	// If available micros under $2 (200 cents) and role is engineer or reviewer only,
	// spawn lean roster.
	if cfg.AvailableMicros < 200 && (cfg.Role == "engineer" || cfg.Role == "reviewer") {
		return spawnLeanRoster(cfg)
	}

	// Otherwise, spawn full arena roster.
	return spawnFullArena(cfg)
}

func spawnLeanRoster(cfg Config) (*Roster, error) {
	return &Roster{
		Type:   LeanRoster,
		Micros: cfg.AvailableMicros,
		Role:   cfg.Role,
	}, nil
}

func spawnFullArena(cfg Config) (*Roster, error) {
	// If budget is tight, disallow full arena spawn.
	if cfg.MonthlyBudgetCents < 800 {
		return nil, ErrBudgetExceeded
	}
	return &Roster{
		Type:   FullArena,
		Micros: cfg.AvailableMicros,
		Role:   cfg.Role,
	}, nil
}

// RosterManager manages roster spawning with concurrency safety.
type RosterManager struct {
	mu     sync.Mutex
	config Config
	roster *Roster
}

// NewRosterManager creates a new roster manager with config.
func NewRosterManager(cfg Config) *RosterManager {
	return &RosterManager{
		config: cfg,
	}
}

// Spawn spawns a roster according to the config and updates the manager state.
func (rm *RosterManager) Spawn() (*Roster, error) {
	rm.mu.Lock()
	defer rm.mu.Unlock()

	r, err := SpawnRoster(rm.config)
	if err != nil {
		return nil, err
	}
	rm.roster = r
	return r, nil
}

// Current returns the current roster.
func (rm *RosterManager) Current() *Roster {
	rm.mu.Lock()
	defer rm.mu.Unlock()
	return rm.roster
}
