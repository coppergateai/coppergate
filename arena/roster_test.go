package arena

import (
	"testing"
)

func TestRosterLeanModeEnforcement(t *testing.T) {
	// Budget $8 = 800 cents triggers lean mode
	r := NewRoster(800)
	r.EnableLeanMode()

	if !r.IsLeanMode() {
		t.Fatal("expected lean mode to be enabled for budget <= $8")
	}

	// Add Engineer micro under $2 (200 cents)
	m1 := &Micro{ID: "m1", Role: RoleEngineer, Cost: 150}
	if err := r.AddMicro(m1); err != nil {
		t.Fatalf("failed to add engineer micro: %v", err)
	}

	// Add Reviewer micro under $2
	m2 := &Micro{ID: "m2", Role: RoleReviewer, Cost: 200}
	if err := r.AddMicro(m2); err != nil {
		t.Fatalf("failed to add reviewer micro: %v", err)
	}

	// Attempt to add FullArena micro - should fail in lean mode
	m3 := &Micro{ID: "m3", Role: RoleFullArena, Cost: 100}
	err := r.AddMicro(m3)
	if err == nil {
		t.Fatal("expected error adding FULL_ARENA micro under lean mode, got none")
	}

	// Attempt to add micro costing > $2 - should fail
	m4 := &Micro{ID: "m4", Role: RoleEngineer, Cost: 250}
	err = r.AddMicro(m4)
	if err == nil {
		t.Fatal("expected error adding micro costing > $2, got none")
	}

	// Add micro that would exceed budget
	m5 := &Micro{ID: "m5", Role: RoleEngineer, Cost: 500}
	err = r.AddMicro(m5)
	if err == nil {
		t.Fatal("expected error adding micro exceeding budget, got none")
	}
}

func TestRosterNonLeanModeAllowsFullArena(t *testing.T) {
	// Budget $10 = 1000 cents disables lean mode
	r := NewRoster(1000)
	r.EnableLeanMode()

	if r.IsLeanMode() {
		t.Fatal("expected lean mode to be disabled for budget > $8")
	}

	m := &Micro{ID: "m1", Role: RoleFullArena, Cost: 100}
	if err := r.AddMicro(m); err != nil {
		t.Fatalf("failed to add FULL_ARENA micro when lean mode disabled: %v", err)
	}
}

func TestRemoveMicro(t *testing.T) {
	r := NewRoster(800)
	r.EnableLeanMode()

	m := &Micro{ID: "m1", Role: RoleEngineer, Cost: 150}
	if err := r.AddMicro(m); err != nil {
		t.Fatalf("failed to add micro: %v", err)
	}

	r.RemoveMicro("m1")

	if len(r.Micros()) != 0 {
		t.Fatal("expected roster to be empty after removal")
	}

	if r.spentCents != 0 {
		t.Fatalf("expected spentCents to be 0 after removal, got %d", r.spentCents)
	}
}
