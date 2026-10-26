package arena

import (
	"testing"
)

func TestLeanRoster_AddMicro(t *testing.T) {
	r := NewLeanRoster()

	// Add valid Engineer micro under cost
	m1 := &Micro{ID: "m1", Role: RoleEngineer, Cost: 1.5}
	if err := r.AddMicro(m1); err != nil {
		t.Fatalf("unexpected error adding m1: %v", err)
	}

	// Add valid Reviewer micro under cost
	m2 := &Micro{ID: "m2", Role: RoleReviewer, Cost: 2.0}
	if err := r.AddMicro(m2); err != nil {
		t.Fatalf("unexpected error adding m2: %v", err)
	}

	// Add micro exceeding per micro cost
	m3 := &Micro{ID: "m3", Role: RoleEngineer, Cost: 2.1}
	if err := r.AddMicro(m3); err != ErrBudgetExceeded {
		t.Fatalf("expected ErrBudgetExceeded for m3, got %v", err)
	}

	// Add micro exceeding total budget
	m4 := &Micro{ID: "m4", Role: RoleEngineer, Cost: 5.0}
	if err := r.AddMicro(m4); err != ErrBudgetExceeded {
		t.Fatalf("expected ErrBudgetExceeded for m4, got %v", err)
	}

	// Add micro with invalid role
	m5 := &Micro{ID: "m5", Role: RoleUnknown, Cost: 1.0}
	if err := r.AddMicro(m5); err != ErrInvalidRole {
		t.Fatalf("expected ErrInvalidRole for m5, got %v", err)
	}

	// Add FULL_ARENA spawn micro (disallowed)
	m6 := &Micro{ID: "m6", Role: RoleFullArenaSpawn, Cost: 1.0}
	if err := r.AddMicro(m6); err != ErrFullArenaSpawnNotAllowed {
		t.Fatalf("expected ErrFullArenaSpawnNotAllowed for m6, got %v", err)
	}

	// Check roster contents
	micros := r.ListMicros()
	if len(micros) != 2 {
		t.Fatalf("expected 2 micros in roster, got %d", len(micros))
	}
}

func TestLeanRoster_RemoveMicro(t *testing.T) {
	r := NewLeanRoster()
	m1 := &Micro{ID: "m1", Role: RoleEngineer, Cost: 1.5}
	if err := r.AddMicro(m1); err != nil {
		t.Fatalf("unexpected error adding m1: %v", err)
	}

	r.RemoveMicro("m1")
	micros := r.ListMicros()
	if len(micros) != 0 {
		t.Fatalf("expected 0 micros after removal, got %d", len(micros))
	}
	if m1.Alive {
		t.Fatalf("expected m1 to be marked not alive after removal")
	}
}
