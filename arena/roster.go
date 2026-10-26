// Package arena provides memory arena management with lean roster support.
//
// AG-012: Implements a lean roster mode that activates when availableMicros budget is under $2.
// This mode restricts arena spawns to Engineer+reviewer only, disallowing FULL_ARENA spawns
// under tight budget constraints.
//
// This feature helps keep memory usage lean and within an $8 monthly envelope budget.
//
// See architecture Open IDs in coppergate-architecture/docs/OPEN_PROGRAM.md for design details.
package arena

import (
	"errors"
	"sync"
	"time"
)

// Role represents user roles in the system.
type Role int

const (
	RoleEngineer Role = iota
	RoleReviewer
	RoleFullArenaSpawn
)

// ErrFullArenaSpawnNotAllowed is returned when FULL_ARENA spawn is disallowed under lean roster.
var ErrFullArenaSpawnNotAllowed = errors.New("FULL_ARENA spawn disallowed under lean roster mode")

// RosterConfig holds configuration for roster behavior.
type RosterConfig struct {
	AvailableMicros int64 // microseconds budget available for arena usage
	MonthlyBudget   int64 // monthly budget in dollars (cents internally)
}

// Roster manages arena spawns with lean roster enforcement.
type Roster struct {
	mu             sync.Mutex
	config         RosterConfig
	leanRosterMode bool
	spawns         map[string]Role // map of spawn IDs to roles
}

// NewRoster creates a new Roster with given config.
func NewRoster(cfg RosterConfig) *Roster {
	r := &Roster{
		config: cfg,
		spawns: make(map[string]Role),
	}
	r.updateLeanRosterMode()
	return r
}

// updateLeanRosterMode updates leanRosterMode flag based on availableMicros and budget.
func (r *Roster) updateLeanRosterMode() {
	// Activate lean roster mode if availableMicros under 2_000 (2ms) and monthly budget <= $8
	if r.config.AvailableMicros < 2_000 && r.config.MonthlyBudget <= 8 {
		r.leanRosterMode = true
	} else {
		r.leanRosterMode = false
	}
}

// UpdateConfig updates the roster config and recalculates lean roster mode.
func (r *Roster) UpdateConfig(cfg RosterConfig) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.config = cfg
	r.updateLeanRosterMode()
}

// SpawnArena attempts to spawn an arena for a given spawnID and role.
// Returns error if FULL_ARENA spawn is disallowed under lean roster mode.
func (r *Roster) SpawnArena(spawnID string, role Role) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	if r.leanRosterMode && role == RoleFullArenaSpawn {
		return ErrFullArenaSpawnNotAllowed
	}

	r.spawns[spawnID] = role
	return nil
}

// RemoveSpawn removes a spawn from the roster.
func (r *Roster) RemoveSpawn(spawnID string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	delete(r.spawns, spawnID)
}

// IsLeanRosterActive returns true if lean roster mode is active.
func (r *Roster) IsLeanRosterActive() bool {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.leanRosterMode
}

// GetSpawns returns a copy of current spawns map.
func (r *Roster) GetSpawns() map[string]Role {
	r.mu.Lock()
	defer r.mu.Unlock()
	cpy := make(map[string]Role, len(r.spawns))
	for k, v := range r.spawns {
		cpy[k] = v
	}
	return cpy
}
