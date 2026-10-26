package arena

import (
	"testing"
)

func TestLeanRoster_AddMicro(t *testing.T) {
	r := NewLeanRoster()

	// Valid micro: Engineer under $2, LEAN_ARENA spawn
	m1 := Micro{ID: "m1", Role: RoleEngineer, Cost: 1.99, Spawn: "LEAN_ARENA"}
	if err := r.AddMicro(m1); err != nil {
		t.Fatalf("expected no error, got %v", err)
	}

	// Valid micro: Reviewer under $2, LEAN_ARENA spawn
	m2 := Micro{ID: "m2", Role: RoleReviewer, Cost: 1.50, Spawn: "LEAN_ARENA"}
	if err := r.AddMicro(m2); err != nil {
		t.Fatalf("expected no error, got %v", err)
	}

	// Invalid role
	m3 := Micro{ID: "m3", Role: "Admin", Cost: 1.00, Spawn: "LEAN_ARENA"}
	if err := r.AddMicro(m3); err != ErrRoleNotAllowed {
		t.Fatalf("expected ErrRoleNotAllowed, got %v", err)
	}

	// Cost exceeds $2
	m4 := Micro{ID: "m4", Role: RoleEngineer, Cost: 2.01, Spawn: "LEAN_ARENA"}
	if err := r.AddMicro(m4); err != ErrCostExceeded {
		t.Fatalf("expected ErrCostExceeded, got %v", err)
	}

	// FULL_ARENA spawn disallowed
	m5 := Micro{ID: "m5", Role: RoleEngineer, Cost: 1.00, Spawn: "FULL_ARENA"}
	if err := r.AddMicro(m5); err != ErrFullArenaNotAllowed {
		t.Fatalf("expected ErrFullArenaNotAllowed, got %v", err)
	}

	// Add micros until budget exceeded
	m6 := Micro{ID: "m6", Role: RoleEngineer, Cost: 4.00, Spawn: "LEAN_ARENA"}
	if err := r.AddMicro(m6); err != ErrCostExceeded {
		// Should fail cost first
		t.Fatalf("expected ErrCostExceeded, got %v", err)
	}

	// Add multiple valid micros to reach budget
	m7 := Micro{ID: "m7", Role: RoleEngineer, Cost: 2.00, Spawn: "LEAN_ARENA"}
	if err := r.AddMicro(m7); err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	m8 := Micro{ID: "m8", Role: RoleReviewer, Cost: 2.00, Spawn: "LEAN_ARENA"}
	if err := r.AddMicro(m8); err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	m9 := Micro{ID: "m9", Role: RoleEngineer, Cost: 2.00, Spawn: "LEAN_ARENA"}
	if err := r.AddMicro(m9); err != nil {
		t.Fatalf("expected no error, got %v", err)
	}

	// Now adding another $2 micro should exceed budget ($1.99 + 1.5 + 2 + 2 + 2 = 9.49 > 8)
	m10 := Micro{ID: "m10", Role: RoleReviewer, Cost: 2.00, Spawn: "LEAN_ARENA"}
	if err := r.AddMicro(m10); err != ErrBudgetExceeded {
		t.Fatalf("expected ErrBudgetExceeded, got %v", err)
	}
}

func TestLeanRoster_RemoveMicro(t *testing.T) {
	r := NewLeanRoster()

	m1 := Micro{ID: "m1", Role: RoleEngineer, Cost: 1.50, Spawn: "LEAN_ARENA"}
	if err := r.AddMicro(m1); err != nil {
		t.Fatalf("expected no error, got %v", err)
	}

	if spend := r.CurrentSpend(); spend != 1.50 {
		t.Fatalf("expected spend 1.50, got %v", spend)
	}

	r.RemoveMicro("m1")

	if spend := r.CurrentSpend(); spend != 0 {
		t.Fatalf("expected spend 0 after removal, got %v", spend)
	}

	// Removing non-existent micro should not panic or error
	r.RemoveMicro("nonexistent")
}

func TestLeanRoster_ListMicros(t *testing.T) {
	r := NewLeanRoster()

	m1 := Micro{ID: "m1", Role: RoleEngineer, Cost: 1.00, Spawn: "LEAN_ARENA"}
	m2 := Micro{ID: "m2", Role: RoleReviewer, Cost: 1.50, Spawn: "LEAN_ARENA"}

	if err := r.AddMicro(m1); err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if err := r.AddMicro(m2); err != nil {
		t.Fatalf("expected no error, got %v", err)
	}

	micros := r.ListMicros()
	if len(micros) != 2 {
		t.Fatalf("expected 2 micros, got %d", len(micros))
	}

	// Check IDs present
	found := map[string]bool{}
	for _, m := range micros {
		found[m.ID] = true
	}
	if !found["m1"] || !found["m2"] {
		t.Fatalf("expected micros m1 and m2 in list")
	}
}
