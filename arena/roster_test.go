package arena

import (
	"testing"
)

func TestLeanRosterModeActivation(t *testing.T) {
	cfg := RosterConfig{
		AvailableMicros: 1500, // under 2ms
		MonthlyEnvelope: 800,  // $8 in cents
	}
	r := NewRoster(cfg)

	if !r.leanRosterMode {
		t.Fatal("expected leanRosterMode to be true under budget constraints")
	}

	// Engineer spawn allowed
	if err := r.SpawnRole(RoleEngineer); err != nil {
		t.Fatalf("expected Engineer spawn allowed, got error: %v", err)
	}

	// Reviewer spawn allowed
	if err := r.SpawnRole(RoleReviewer); err != nil {
		t.Fatalf("expected Reviewer spawn allowed, got error: %v", err)
	}

	// FullArena spawn disallowed
	if err := r.SpawnRole(RoleFullArena); err != ErrSpawnNotAllowed {
		t.Fatalf("expected FullArena spawn disallowed, got error: %v", err)
	}
}

func TestNormalRosterModeAllowsFullArena(t *testing.T) {
	cfg := RosterConfig{
		AvailableMicros: 5000, // over 2ms
		MonthlyEnvelope: 1000, // $10 in cents
	}
	r := NewRoster(cfg)

	if r.leanRosterMode {
		t.Fatal("expected leanRosterMode to be false with relaxed budget")
	}

	// FullArena spawn allowed
	if err := r.SpawnRole(RoleFullArena); err != nil {
		t.Fatalf("expected FullArena spawn allowed, got error: %v", err)
	}
}

func TestUpdateConfigChangesLeanRosterMode(t *testing.T) {
	cfg := RosterConfig{
		AvailableMicros: 5000,
		MonthlyEnvelope: 1000,
	}
	r := NewRoster(cfg)
	if r.leanRosterMode {
		t.Fatal("expected leanRosterMode false initially")
	}

	// Update to tight budget triggers lean roster
	r.UpdateConfig(RosterConfig{
		AvailableMicros: 1000,
		MonthlyEnvelope: 800,
	})
	if !r.leanRosterMode {
		t.Fatal("expected leanRosterMode true after update")
	}

	// FullArena spawn disallowed now
	if err := r.SpawnRole(RoleFullArena); err != ErrSpawnNotAllowed {
		t.Fatalf("expected FullArena spawn disallowed after update, got error: %v", err)
	}
}

func TestActiveRoles(t *testing.T) {
	cfg := RosterConfig{
		AvailableMicros: 1500,
		MonthlyEnvelope: 800,
	}
	r := NewRoster(cfg)

	r.SpawnRole(RoleEngineer)
	r.SpawnRole(RoleReviewer)

	roles := r.ActiveRoles()
	if len(roles) != 2 {
		t.Fatalf("expected 2 active roles, got %d", len(roles))
	}

	r.DespawnRole(RoleEngineer)
	roles = r.ActiveRoles()
	if len(roles) != 1 {
		t.Fatalf("expected 1 active role after despawn, got %d", len(roles))
	}
}
