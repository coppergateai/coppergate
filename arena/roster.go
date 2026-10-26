package arena

import (
	"errors"
	"sync"
)

// RosterType defines the type of roster allocation.
type RosterType int

const (
	// FullArenaRoster is the default roster type with full arena allocation.
	FullArenaRoster RosterType = iota
	// LeanRoster is a lean roster allocation under tight budget constraints.
	LeanRoster
)

// ErrBudgetExceeded is returned when the budget does not allow full arena spawn.
var ErrBudgetExceeded = errors.New("budget too tight for full arena spawn")

// RosterConfig holds configuration for roster allocation.
type RosterConfig struct {
	MonthlyBudgetUSD float64
	// MicrosCostPerEngineer is the cost in micros per engineer+reviewer.
	MicrosCostPerEngineer int64
	// RequestedRosterType is the desired roster type.
	RequestedRosterType RosterType
}

// Roster represents a roster allocation.
type Roster struct {
	Type       RosterType
	Engineers  int
	Reviewers  int
	TotalCost  int64 // in micros
	underBudget bool
	mu         sync.Mutex
}

// NewRoster creates a new roster allocation based on config and budget constraints.
// It returns ErrBudgetExceeded if full arena spawn is requested but budget is too tight.
func NewRoster(cfg RosterConfig, engineers, reviewers int) (*Roster, error) {
	r := &Roster{
		Engineers: engineers,
		Reviewers: reviewers,
	}

	// Calculate total micros cost for engineer+reviewer pairs.
	totalPairs := engineers + reviewers
	totalCost := int64(totalPairs) * cfg.MicrosCostPerEngineer

	// Convert monthly budget to micros.
	monthlyBudgetMicros := int64(cfg.MonthlyBudgetUSD * 1_000_000)

	switch cfg.RequestedRosterType {
	case LeanRoster:
		// Lean roster only allowed if cost under $2 (2,000,000 micros).
		if totalCost > 2_000_000 {
			// If requested lean but cost exceeds $2 micros, fallback to full arena if budget allows.
			if totalCost <= monthlyBudgetMicros {
				r.Type = FullArenaRoster
				r.TotalCost = totalCost
				r.underBudget = true
				return r, nil
			}
			return nil, ErrBudgetExceeded
		}
		// Lean roster allowed under $2 micros cost.
		r.Type = LeanRoster
		r.TotalCost = totalCost
		r.underBudget = true
		return r, nil

	case FullArenaRoster:
		// Full arena spawn only if budget allows.
		if totalCost > monthlyBudgetMicros {
			return nil, ErrBudgetExceeded
		}
		r.Type = FullArenaRoster
		r.TotalCost = totalCost
		r.underBudget = true
		return r, nil

	default:
		// Default to full arena if unknown roster type.
		if totalCost > monthlyBudgetMicros {
			return nil, ErrBudgetExceeded
		}
		r.Type = FullArenaRoster
		r.TotalCost = totalCost
		r.underBudget = true
		return r, nil
	}
}

// IsLean returns true if the roster is lean.
func (r *Roster) IsLean() bool {
	return r.Type == LeanRoster
}

// IsFullArena returns true if the roster is full arena.
func (r *Roster) IsFullArena() bool {
	return r.Type == FullArenaRoster
}
