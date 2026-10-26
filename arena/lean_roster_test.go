package arena

import (
	"testing"
)

func TestLeanRoster_AddMicro(t *testing.T) {
	lr := NewLeanRoster(8.0, 2.0)

	// Allowed micro: Engineer under $2
	m1 := &Micro{ID: "m1", Cost: 1.5, Role: RoleEngineer}
	if err := lr.AddMicro(m1); err != nil {
		t.Fatalf("expected add micro success, got error: %v", err)
	}

	// Allowed micro: Reviewer under $2
	m2 := &Micro{ID: "m2", Cost: 1.0, Role: RoleReviewer}
	if err := lr.AddMicro(m2); err != nil {
		t.Fatalf("expected add micro success, got error: %v", err)
	}

	// Disallowed role: FullArena
	m3 := &Micro{ID: "m3", Cost: 1.0, Role: RoleFullArena}
	if err := lr.AddMicro(m3); err != ErrFullArenaDisallow {
		t.Fatalf("expected FULL_ARENA disallow error, got: %v", err)
	}

	// Disallowed role: Unknown
	m4 := &Micro{ID: "m4", Cost: 1.0, Role: RoleUnknown}
	if err := lr.AddMicro(m4); err != ErrRoleNotAllowed {
		t.Fatalf("expected role not allowed error, got: %v", err)
	}

	// Cost exceeds maxMicroCost
	m5 := &Micro{ID: "m5", Cost: 2.5, Role: RoleEngineer}
	if err := lr.AddMicro(m5); err != ErrBudgetExceeded {
		t.Fatalf("expected budget exceeded error for cost > maxMicroCost, got: %v", err)
	}

	// Add micros until budget exceeded
	m6 := &Micro{ID: "m6", Cost: 5.0, Role: RoleEngineer}
	if err := lr.AddMicro(m6); err != ErrBudgetExceeded {
		t.Fatalf("expected budget exceeded error for total cost > budget, got: %v", err)
	}

	// Remove micro and add again
	lr.RemoveMicro("m1")
	if err := lr.AddMicro(m6); err != nil {
		t.Fatalf("expected add micro success after removal, got error: %v", err)
	}

	// ListMicros check
	micros := lr.ListMicros()
	if len(micros) != 2 {
		t.Fatalf("expected 2 micros in roster, got %d", len(micros))
	}
}

func TestLeanRoster_CurrentSpent(t *testing.T) {
	lr := NewLeanRoster(8.0, 2.0)
	m1 := &Micro{ID: "m1", Cost: 1.5, Role: RoleEngineer}
	m2 := &Micro{ID: "m2", Cost: 1.0, Role: RoleReviewer}

	if err := lr.AddMicro(m1); err != nil {
		t.Fatal(err)
	}
	if err := lr.AddMicro(m2); err != nil {
		t.Fatal(err)
	}

	spent := lr.CurrentSpent()
	if spent != 2.5 {
		t.Fatalf("expected spent 2.5, got %f", spent)
	}

	lr.RemoveMicro("m1")
	spent = lr.CurrentSpent()
	if spent != 1.0 {
		t.Fatalf("expected spent 1.0 after removal, got %f", spent)
	}
}
