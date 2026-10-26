package arena

import (
	"testing"
)

func TestLeanRosterActivation(t *testing.T) {
	cfg := RosterConfig{
		AvailableMicros: 1_500, // under 2ms
		MonthlyBudget:   8,
	}
	r := NewRoster(cfg)

	if !r.IsLeanRosterActive() {
		t.Errorf("expected lean roster mode active, got inactive")
	}

	// Spawn Engineer allowed
	if err := r.SpawnArena("spawn1", RoleEngineer); err != nil {
		t.Errorf("unexpected error spawning engineer: %v", err)
	}

	// Spawn Reviewer allowed
	if err := r.SpawnArena("spawn2", RoleReviewer); err != nil {
		t.Errorf("unexpected error spawning reviewer: %v", err)
	}

	// Spawn FULL_ARENA disallowed
	err := r.SpawnArena("spawn3", RoleFullArenaSpawn)
	if err != ErrFullArenaSpawnNotAllowed {
		t.Errorf("expected ErrFullArenaSpawnNotAllowed, got %v", err)
	}
}

func TestLeanRosterDeactivation(t *testing.T) {
	cfg := RosterConfig{
		AvailableMicros: 3_000, // over 2ms
		MonthlyBudget:   8,
	}
	r := NewRoster(cfg)

	if r.IsLeanRosterActive() {
		t.Errorf("expected lean roster mode inactive, got active")
	}

	// Spawn FULL_ARENA allowed
	if err := r.SpawnArena("spawn1", RoleFullArenaSpawn); err != nil {
		t.Errorf("unexpected error spawning full arena: %v", err)
	}
}

func TestUpdateConfigChangesMode(t *testing.T) {
	cfg := RosterConfig{
		AvailableMicros: 3_000,
		MonthlyBudget:   8,
	}
	r := NewRoster(cfg)
	if r.IsLeanRosterActive() {
		t.Errorf("expected lean roster inactive initially")
	}

	// Update to lean roster conditions
	r.UpdateConfig(RosterConfig{
		AvailableMicros: 1_000,
		MonthlyBudget:   8,
	})
	if !r.IsLeanRosterActive() {
		t.Errorf("expected lean roster active after update")
	}
}

func TestRemoveSpawn(t *testing.T) {
	cfg := RosterConfig{
		AvailableMicros: 1_000,
		MonthlyBudget:   8,
	}
	r := NewRoster(cfg)

	r.SpawnArena("spawn1", RoleEngineer)
	r.SpawnArena("spawn2", RoleReviewer)

	spawns := r.GetSpawns()
	if len(spawns) != 2 {
		t.Errorf("expected 2 spawns, got %d", len(spawns))
	}

	r.RemoveSpawn("spawn1")
	spawns = r.GetSpawns()
	if len(spawns) != 1 {
		t.Errorf("expected 1 spawn after removal, got %d", len(spawns))
	}
	if _, ok := spawns["spawn1"]; ok {
		t.Errorf("spawn1 should have been removed")
	}
}
