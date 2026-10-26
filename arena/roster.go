// Package arena provides memory arena allocation with lean roster support.
//
// AG-012: Implements a lean roster mode that activates when availableMicros budget is under $2.
// In this mode, only Engineer+reviewer roles are allowed to spawn; FULL_ARENA spawn is disabled
// to keep memory and CPU usage within tight budget constraints.
//
// This feature matches architecture acceptance criteria from coppergate-architecture/docs/OPEN_PROGRAM.md.
package arena

import (
	"errors"
	"sync"
	"time"
)

// Role represents a user role in the arena.
type Role int

const (
	RoleEngineer Role = iota
	RoleReviewer
	RoleFullArena
)

// ErrSpawnNotAllowed is returned when spawn is disallowed under lean roster mode.
var ErrSpawnNotAllowed = errors.New("spawn not allowed under lean roster mode")

// RosterConfig configures the roster behavior.
type RosterConfig struct {
	AvailableMicros int64 // microseconds budget available for this roster cycle
	MonthlyEnvelope int64 // monthly budget envelope in dollars (cents internally)
}

// Roster manages the set of active roles and spawn permissions.
type Roster struct {
	mu             sync.Mutex
	config         RosterConfig
	activeRoles    map[Role]bool
	leanRosterMode bool
}

// NewRoster creates a new Roster with given config.
func NewRoster(cfg RosterConfig) *Roster {
	r := &Roster{
		config:      cfg,
		activeRoles: make(map[Role]bool),
	}
	r.evaluateLeanRosterMode()
	return r
}

// evaluateLeanRosterMode sets leanRosterMode based on availableMicros and budget envelope.
func (r *Roster) evaluateLeanRosterMode() {
	// Activate lean roster if availableMicros under 2,000 (2ms) and monthly envelope <= $8 (800 cents)
	if r.config.AvailableMicros < 2000 && r.config.MonthlyEnvelope <= 800 {
		r.leanRosterMode = true
	} else {
		r.leanRosterMode = false
	}
}

// SpawnRole attempts to spawn a role in the roster.
// Returns ErrSpawnNotAllowed if spawn is disallowed under lean roster mode.
func (r *Roster) SpawnRole(role Role) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	if r.leanRosterMode {
		// Only Engineer and Reviewer allowed under lean roster
		if role != RoleEngineer && role != RoleReviewer {
			return ErrSpawnNotAllowed
		}
	}

	r.activeRoles[role] = true
	return nil
}

// DespawnRole removes a role from the roster.
func (r *Roster) DespawnRole(role Role) {
	r.mu.Lock()
	defer r.mu.Unlock()
	delete(r.activeRoles, role)
}

// ActiveRoles returns a snapshot of currently active roles.
func (r *Roster) ActiveRoles() []Role {
	r.mu.Lock()
	defer r.mu.Unlock()
	roles := make([]Role, 0, len(r.activeRoles))
	for role := range r.activeRoles {
		roles = append(roles, role)
	}
	return roles
}

// UpdateConfig updates the roster config and reevaluates lean roster mode.
func (r *Roster) UpdateConfig(cfg RosterConfig) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.config = cfg
	r.evaluateLeanRosterMode()
}
