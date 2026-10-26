// Package arena provides a lean memory arena allocator optimized for small micros under $2 monthly budget.
// It avoids spawning full arenas under tight budget constraints, suitable for engineer+reviewer workloads.
//
// AG-012: Lean roster arena allocator implementation.
package arena

import (
	"errors"
	"sync"
)

// ErrBudgetExceeded is returned when the monthly budget is exceeded and no new arena can be spawned.
var ErrBudgetExceeded = errors.New("arena: monthly budget exceeded, cannot spawn full arena")

// Config holds configuration for the lean arena allocator.
type Config struct {
	// MonthlyBudgetUSD is the allowed monthly spend envelope in USD.
	MonthlyBudgetUSD float64
	// CostPerArenaUSD is the cost to spawn a full arena.
	CostPerArenaUSD float64
	// CostPerMicroUSD is the cost per micro allocation.
	CostPerMicroUSD float64
}

// Arena represents a lean memory arena.
type Arena struct {
	mu       sync.Mutex
	micros   [][]byte // small allocations
	fullArena bool    // indicates if this is a full arena (disallowed under budget)
	config   Config
	spentUSD float64
}

// NewArena creates a new lean arena if budget allows.
// It refuses to spawn a full arena if the budget is tight.
func NewArena(cfg Config) (*Arena, error) {
	if cfg.MonthlyBudgetUSD < cfg.CostPerArenaUSD {
		// Budget too tight for full arena spawn.
		return nil, ErrBudgetExceeded
	}
	return &Arena{
		micros:   make([][]byte, 0, 64),
		fullArena: false,
		config:   cfg,
		spentUSD: 0,
	}, nil
}

// AllocMicro allocates a small micro allocation under $2 cost.
// Returns error if budget exceeded.
func (a *Arena) AllocMicro(size int) ([]byte, error) {
	a.mu.Lock()
	defer a.mu.Unlock()

	cost := float64(size) * a.config.CostPerMicroUSD
	if a.spentUSD+cost > a.config.MonthlyBudgetUSD {
		return nil, ErrBudgetExceeded
	}
	buf := make([]byte, size)
	a.micros = append(a.micros, buf)
	a.spentUSD += cost
	return buf, nil
}

// IsFullArena returns true if this arena is a full arena (should be false under tight budget).
func (a *Arena) IsFullArena() bool {
	return a.fullArena
}

// Reset clears all micro allocations.
func (a *Arena) Reset() {
	a.mu.Lock()
	defer a.mu.Unlock()
	a.micros = a.micros[:0]
	a.spentUSD = 0
}
