package arena

import (
	"errors"
	"sync"
)

// RosterType defines the type of roster allocation.
type RosterType int

const (
	// FullArenaRoster represents the full arena roster allocation.
	FullArenaRoster RosterType = iota
	// LeanRoster represents the lean roster allocation.
	LeanRoster
)

// ErrBudgetExceeded is returned when the budget is insufficient for the requested roster.
var ErrBudgetExceeded = errors.New("budget exceeded for requested roster")

// RosterConfig holds configuration for roster allocation.
type RosterConfig struct {
	MonthlyBudgetCents int    // Monthly budget in cents
	AvailableMicros    int64  // Available micros (microseconds or micro units)
	Role               string // Role of the user (Engineer, Reviewer, etc.)
}

// Roster represents a roster allocation.
type Roster struct {
	Type        RosterType
	Engineers   int
	Reviewers   int
	TotalMicros int64
}

// AllocateRoster allocates a roster based on the given config.
// It returns a lean roster if available micros are under $2 (200 cents) and role is Engineer or Reviewer.
// It never spawns a FullArena roster under tight budget ($8 monthly).
func AllocateRoster(cfg RosterConfig) (*Roster, error) {
	const (
		leanRosterMicrosLimit = 2_000_000 // $2 in micros (assuming 1 micro = 1 cent * 10000)
		tightBudgetCents      = 800       // $8 monthly budget in cents
	)

	// Check if monthly budget is tight
	if cfg.MonthlyBudgetCents <= tightBudgetCents {
		// Only allow lean roster for Engineer or Reviewer roles
		if cfg.AvailableMicros <= leanRosterMicrosLimit && (cfg.Role == "Engineer" || cfg.Role == "Reviewer") {
			return &Roster{
				Type:        LeanRoster,
				Engineers:   1,
				Reviewers:   1,
				TotalMicros: cfg.AvailableMicros,
			}, nil
		}
		// Do not spawn FullArena roster under tight budget
		return nil, ErrBudgetExceeded
	}

	// For budgets above $8, spawn full arena roster
	return &Roster{
		Type:        FullArenaRoster,
		Engineers:   5,
		Reviewers:   3,
		TotalMicros: cfg.AvailableMicros,
	}, nil
}

// RosterManager manages roster allocations with concurrency safety.
type RosterManager struct {
	mu     sync.Mutex
	roster *Roster
}

// NewRosterManager creates a new RosterManager.
func NewRosterManager() *RosterManager {
	return &RosterManager{}
}

// GetRoster returns the current roster or allocates a new one based on config.
func (rm *RosterManager) GetRoster(cfg RosterConfig) (*Roster, error) {
	rm.mu.Lock()
	defer rm.mu.Unlock()

	if rm.roster != nil {
		return rm.roster, nil
	}

	r, err := AllocateRoster(cfg)
	if err != nil {
		return nil, err
	}
	rm.roster = r
	return r, nil
}
