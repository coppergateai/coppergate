package arena

import (
	"testing"
)

func TestLeanRoster_AddMicro(t *testing.T) {
	lr := NewLeanRoster(8.0)

	// Valid micro under $2 and allowed role
	m1 := &Micro{ID: "m1", Role: RoleEngineer, Cost: 1.5}
	if err := lr.AddMicro(m1); err != nil {
		t.Fatalf("expected add success, got error: %v", err)
	}

	// Duplicate ID
	if err := lr.AddMicro(m1); err == nil {
		t.Fatalf("expected error on duplicate ID")
	}

	// Disallowed role FULL_ARENA
	m2 := &Micro{ID: "m2", Role: RoleFullArena, Cost: 1.0}
	if err := lr.AddMicro(m2); err == nil {
		t.Fatalf("expected error on disallowed role FULL_ARENA")
	}

	// Cost above $2
	m3 := &Micro{ID: "m3", Role: RoleReviewer, Cost: 2.01}
	if err := lr.AddMicro(m3); err == nil {
		t.Fatalf("expected error on cost above $2")
	}

	// Add multiple valid micros until budget exceeded
	m4 := &Micro{ID: "m4", Role: RoleReviewer, Cost: 2.0}
	m5 := &Micro{ID: "m5", Role: RoleEngineer, Cost: 2.0}
	m6 := &Micro{ID: "m6", Role: RoleEngineer, Cost: 2.0}

	if err := lr.AddMicro(m4); err != nil {
		t.Fatalf("expected add success m4, got %v", err)
	}
	if err := lr.AddMicro(m5); err != nil {
		t.Fatalf("expected add success m5, got %v", err)
	}
	// Adding m6 would exceed $8 budget (1.5 + 2 + 2 + 2 = 7.5 + 2 = 9.5 > 8)
	if err := lr.AddMicro(m6); err == nil {
		t.Fatalf("expected budget exceeded error on m6")
	}

	// Remove micro and add again
	lr.RemoveMicro("m1")
	if err := lr.AddMicro(m6); err != nil {
		t.Fatalf("expected add success after removal, got %v", err)
	}
}

func TestLeanRoster_GetMicros_TotalSpent(t *testing.T) {
	lr := NewLeanRoster(8.0)
	m1 := &Micro{ID: "m1", Role: RoleEngineer, Cost: 1.0}
	m2 := &Micro{ID: "m2", Role: RoleReviewer, Cost: 1.5}

	if err := lr.AddMicro(m1); err != nil {
		t.Fatal(err)
	}
	if err := lr.AddMicro(m2); err != nil {
		t.Fatal(err)
	}

	micros := lr.GetMicros()
	if len(micros) != 2 {
		t.Fatalf("expected 2 micros, got %d", len(micros))
	}

	spent := lr.TotalSpent()
	if spent != 2.5 {
		t.Fatalf("expected spent 2.5, got %f", spent)
	}
}
