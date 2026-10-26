// Package arena provides memory arena allocation with lean roster support
// to reduce memory footprint under tight budget constraints.
//
// AG-012: Lean roster implementation for micros under $2 monthly spend.
// Engineer+reviewer only; no FULL_ARENA spawn under tight budget.
package arena

import (
	"errors"
	"sync"
)

// ErrBudgetExceeded is returned when the monthly budget envelope is exceeded.
var ErrBudgetExceeded = errors.New("monthly budget envelope exceeded")

// MonthlyBudget represents the monthly spend envelope in dollars.
const MonthlyBudget = 8.0

// MicroCost represents the cost per micro allocation in dollars.
const MicroCost = 0.5

// ArenaType identifies the type of arena allocation.
type ArenaType int

const (
	// FULL_ARENA is the default arena type with full features.
	FULL_ARENA ArenaType = iota
	// LEAN_ROSTER is a lean arena type with minimal memory footprint.
	LEAN_ROSTER
)

// ArenaConfig holds configuration for arena allocation.
type ArenaConfig struct {
	// BudgetEnvelope is the monthly spend envelope in dollars.
	BudgetEnvelope float64
	// MicrosRequested is the number of micros requested.
	MicrosRequested int
	// EngineerReviewerOnly indicates if the allocation is for engineer+reviewer only.
	EngineerReviewerOnly bool
}

// Arena represents a memory arena.
type Arena struct {
	Type ArenaType
	// micros allocated in this arena
	micros int
	// mutex protects arena state
	mu sync.Mutex
}

// NewArena creates a new arena based on the config and budget constraints.
// Returns ErrBudgetExceeded if the budget envelope is exceeded.
func NewArena(cfg ArenaConfig) (*Arena, error) {
	if cfg.BudgetEnvelope <= 0 {
		cfg.BudgetEnvelope = MonthlyBudget
	}

	// Calculate cost of requested micros
	cost := float64(cfg.MicrosRequested) * MicroCost

	// If micros under $2 and engineer+reviewer only, use lean roster
	if cost <= 2.0 && cfg.EngineerReviewerOnly {
		// Check budget envelope
		if cost > cfg.BudgetEnvelope {
			return nil, ErrBudgetExceeded
		}
		return &Arena{
			Type:   LEAN_ROSTER,
			micros: cfg.MicrosRequested,
		}, nil
	}

	// For other cases, do not spawn FULL_ARENA if budget is tight
	if cost > cfg.BudgetEnvelope {
		return nil, ErrBudgetExceeded
	}

	// Default to FULL_ARENA
	return &Arena{
		Type:   FULL_ARENA,
		micros: cfg.MicrosRequested,
	}, nil
}

// TypeString returns a string representation of the arena type.
func (a *Arena) TypeString() string {
	switch a.Type {
	case FULL_ARENA:
		return "FULL_ARENA"
	case LEAN_ROSTER:
		return "LEAN_ROSTER"
	default:
		return "UNKNOWN"
	}
}
