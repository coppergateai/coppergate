package arena

import (
	"testing"
)

func TestLeanRoster_AddMicro(t *testing.T) {
	lr := NewLeanRoster(8.0)

	// Valid micro: Engineer under $2 cost
	m1 := &Micro{ID: "m1", Role: RoleEngineer, Cost: 1.5}
	if err := lr.AddMicro(m1); err != nil {
		t.Fatalf("expected add micro success, got error: %v", err)
	}

	// Valid micro: Reviewer under $2 cost
	m2 := &Micro{ID: "m2", Role: RoleReviewer, Cost: 2.0}
	if err := lr.AddMicro(m2); err != nil {
		t.Fatalf("expected add micro success, got error: %v", err)
	}

	// Invalid role FULL_ARENA
	m3 := &Micro{ID: "m3", Role: RoleFullArena, Cost: 1.0}
	if err := lr.AddMicro(m3); err != ErrRoleNotAllowed {
		t.Fatalf("expected ErrRoleNotAllowed, got: %v", err)
	}

	// Cost exceeds $2 limit
	m4 := &Micro{ID: "m4", Role: RoleEngineer, Cost: 2.1}
	if err := lr.AddMicro(m4); err != ErrCostExceedsLimit {
		t.Fatalf("expected ErrCostExceedsLimit, got: %v", err)
	}

	// Duplicate ID
	m5 := &Micro{ID: "m1", Role: RoleEngineer, Cost: 1.0}
	if err := lr.AddMicro(m5); err != ErrMicroExists {
		t.Fatalf("expected ErrMicroExists, got: %v", err)
	}

	// Add micros until budget exceeded
	m6 := &Micro{ID: "m6", Role: RoleEngineer, Cost: 4.5}
	if err := lr.AddMicro(m6); err != ErrCostExceedsLimit {
		// Cost too high, so ErrCostExceedsLimit expected first
		t.Fatalf("expected ErrCostExceedsLimit, got: %v", err)
	}

	// Add multiple small micros to reach budget
	m7 := &Micro{ID: "m7", Role: RoleEngineer, Cost: 2.0}
	m8 := &Micro{ID: "m8", Role: RoleReviewer, Cost: 2.0}
	m9 := &Micro{ID: "m9", Role: RoleEngineer, Cost: 2.0}

	if err := lr.AddMicro(m7); err != nil {
		t.Fatalf("expected add micro success, got error: %v", err)
	}
	if err := lr.AddMicro(m8); err != nil {
		t.Fatalf("expected add micro success, got error: %v", err)
	}
	// Adding m9 would exceed budget (1.5+2+2+2+2=9.5 > 8)
	if err := lr.AddMicro(m9); err != ErrBudgetExceeded {
		t.Fatalf("expected ErrBudgetExceeded, got: %v", err)
	}
}

func TestLeanRoster_RemoveMicro(t *testing.T) {
	lr := NewLeanRoster(8.0)
	m1 := &Micro{ID: "m1", Role: RoleEngineer, Cost: 1.5}
	if err := lr.AddMicro(m1); err != nil {
		t.Fatalf("add micro failed: %v", err)
	}

	if err := lr.RemoveMicro("m1"); err != nil {
		t.Fatalf("remove micro failed: %v", err)
	}

	// Removing again should error
	if err := lr.RemoveMicro("m1"); err != ErrMicroNotFound {
		t.Fatalf("expected ErrMicroNotFound, got: %v", err)
	}

	// After removal, budget should be refunded
	if spent := lr.TotalSpent(); spent != 0 {
		t.Fatalf("expected spent 0 after removal, got %v", spent)
	}
}

func TestLeanRoster_ListMicros(t *testing.T) {
	lr := NewLeanRoster(8.0)
	m1 := &Micro{ID: "m1", Role: RoleEngineer, Cost: 1.0}
	m2 := &Micro{ID: "m2", Role: RoleReviewer, Cost: 1.5}
	lr.AddMicro(m1)
	lr.AddMicro(m2)

	micros := lr.ListMicros()
	if len(micros) != 2 {
		t.Fatalf("expected 2 micros, got %d", len(micros))
	}

	ids := map[string]bool{}
	for _, m := range micros {
		ids[m.ID] = true
	}
	if !ids["m1"] || !ids["m2"] {
		t.Fatalf("missing expected micro IDs in list")
	}
}

func TestLeanRoster_TotalSpent(t *testing.T) {
	lr := NewLeanRoster(8.0)
	if spent := lr.TotalSpent(); spent != 0 {
		t.Fatalf("expected 0 spent initially, got %v", spent)
	}

	m1 := &Micro{ID: "m1", Role: RoleEngineer, Cost: 1.5}
	m2 := &Micro{ID: "m2", Role: RoleReviewer, Cost: 2.0}
	lr.AddMicro(m1)
	lr.AddMicro(m2)

	expected := 3.5
	if spent := lr.TotalSpent(); spent != expected {
		t.Fatalf("expected spent %v, got %v", expected, spent)
	}
}
