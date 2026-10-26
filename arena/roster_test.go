package arena

import (
	"testing"
)

func TestRosterLeanModeAddMicro(t *testing.T) {
	// $8 budget triggers lean mode
	r := NewRoster(800)

	if !r.IsLeanMode() {
		t.Fatal("expected lean mode for $8 budget")
	}

	// Valid micro: Engineer, $2, LEAN spawn
	m1 := &Micro{
		ID:    "m1",
		Role:  RoleEngineer,
		Cost:  200,
		Spawn: SpawnLean,
	}
	if err := r.AddMicro(m1); err != nil {
		t.Fatalf("unexpected error adding valid micro: %v", err)
	}

	// Invalid role
	m2 := &Micro{
		ID:    "m2",
		Role:  RoleOther,
		Cost:  100,
		Spawn: SpawnLean,
	}
	if err := r.AddMicro(m2); err == nil {
		t.Fatal("expected error adding micro with invalid role in lean mode")
	}

	// Cost too high
	m3 := &Micro{
		ID:    "m3",
		Role:  RoleEngineer,
		Cost:  250,
		Spawn: SpawnLean,
	}
	if err := r.AddMicro(m3); err == nil {
		t.Fatal("expected error adding micro with cost > $2 in lean mode")
	}

	// FULL_ARENA spawn disallowed
	m4 := &Micro{
		ID:    "m4",
		Role:  RoleReviewer,
		Cost:  150,
		Spawn: SpawnFullArena,
	}
	if err := r.AddMicro(m4); err == nil {
		t.Fatal("expected error adding micro with FULL_ARENA spawn in lean mode")
	}

	// Adding micro exceeding budget
	m5 := &Micro{
		ID:    "m5",
		Role:  RoleEngineer,
		Cost:  700,
		Spawn: SpawnLean,
	}
	if err := r.AddMicro(m5); err == nil {
		t.Fatal("expected error adding micro exceeding budget")
	}
}

func TestRosterNonLeanModeAddMicro(t *testing.T) {
	// $10 budget disables lean mode
	r := NewRoster(1000)

	if r.IsLeanMode() {
		t.Fatal("expected non-lean mode for $10 budget")
	}

	// Add FULL_ARENA spawn allowed
	m1 := &Micro{
		ID:    "m1",
		Role:  RoleOther,
		Cost:  500,
		Spawn: SpawnFullArena,
	}
	if err := r.AddMicro(m1); err != nil {
		t.Fatalf("unexpected error adding micro in non-lean mode: %v", err)
	}

	// Add Engineer with cost > $2 allowed
	m2 := &Micro{
		ID:    "m2",
		Role:  RoleEngineer,
		Cost:  600,
		Spawn: SpawnLean,
	}
	if err := r.AddMicro(m2); err == nil {
		t.Fatal("expected error adding micro exceeding budget")
	}
}

func TestRemoveMicro(t *testing.T) {
	r := NewRoster(800)
	m := &Micro{
		ID:    "m1",
		Role:  RoleEngineer,
		Cost:  200,
		Spawn: SpawnLean,
	}
	if err := r.AddMicro(m); err != nil {
		t.Fatalf("unexpected error adding micro: %v", err)
	}

	if err := r.RemoveMicro("m1"); err != nil {
		t.Fatalf("unexpected error removing micro: %v", err)
	}

	if err := r.RemoveMicro("m1"); err == nil {
		t.Fatal("expected error removing non-existent micro")
	}
}

func TestListMicros(t *testing.T) {
	r := NewRoster(800)
	m1 := &Micro{
		ID:    "m1",
		Role:  RoleEngineer,
		Cost:  200,
		Spawn: SpawnLean,
	}
	m2 := &Micro{
		ID:    "m2",
		Role:  RoleReviewer,
		Cost:  150,
		Spawn: SpawnLean,
	}
	if err := r.AddMicro(m1); err != nil {
		t.Fatalf("unexpected error adding micro: %v", err)
	}
	if err := r.AddMicro(m2); err != nil {
		t.Fatalf("unexpected error adding micro: %v", err)
	}

	micros := r.ListMicros()
	if len(micros) != 2 {
		t.Fatalf("expected 2 micros, got %d", len(micros))
	}
}
