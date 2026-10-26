package arena

import (
	"testing"
)

func TestRoster_AddMicro(t *testing.T) {
	r := NewRoster(8.0)

	// Valid micro under $2, Engineer role, no FULL_ARENA
	m1 := &Micro{ID: "m1", Role: RoleEngineer, Cost: 1.5, FullArena: false}
	if err := r.AddMicro(m1); err != nil {
		t.Fatalf("expected add micro success, got error: %v", err)
	}

	// Duplicate micro ID
	if err := r.AddMicro(m1); err == nil {
		t.Fatal("expected error on duplicate micro ID")
	}

	// Micro cost over $2
	m2 := &Micro{ID: "m2", Role: RoleEngineer, Cost: 2.5, FullArena: false}
	if err := r.AddMicro(m2); err == nil {
		t.Fatal("expected error on micro cost > $2")
	}

	// Micro role not allowed
	m3 := &Micro{ID: "m3", Role: RoleOther, Cost: 1.0, FullArena: false}
	if err := r.AddMicro(m3); err == nil {
		t.Fatal("expected error on disallowed role")
	}

	// FULL_ARENA spawn not allowed
	m4 := &Micro{ID: "m4", Role: RoleEngineer, Cost: 1.0, FullArena: true}
	if err := r.AddMicro(m4); err == nil {
		t.Fatal("expected error on FULL_ARENA spawn")
	}

	// Add micros until budget exceeded
	m5 := &Micro{ID: "m5", Role: RoleReviewer, Cost: 2.0, FullArena: false}
	if err := r.AddMicro(m5); err != nil {
		t.Fatalf("expected add micro success, got error: %v", err)
	}
	m6 := &Micro{ID: "m6", Role: RoleEngineer, Cost: 2.0, FullArena: false}
	if err := r.AddMicro(m6); err != nil {
		t.Fatalf("expected add micro success, got error: %v", err)
	}
	// This next micro would exceed $8 budget (1.5 + 2 + 2 + 2 = 7.5, adding 1.0 would be 8.5)
	m7 := &Micro{ID: "m7", Role: RoleEngineer, Cost: 1.0, FullArena: false}
	if err := r.AddMicro(m7); err == nil {
		t.Fatal("expected error on budget exceeded")
	}
}

func TestRoster_RemoveMicro(t *testing.T) {
	r := NewRoster(8.0)
	m := &Micro{ID: "m1", Role: RoleEngineer, Cost: 1.5, FullArena: false}
	if err := r.AddMicro(m); err != nil {
		t.Fatalf("add micro failed: %v", err)
	}
	if err := r.RemoveMicro("m1"); err != nil {
		t.Fatalf("remove micro failed: %v", err)
	}
	if r.CurrentSpent() != 0 {
		t.Fatalf("expected spent 0 after removal, got %f", r.CurrentSpent())
	}
	if err := r.RemoveMicro("m1"); err == nil {
		t.Fatal("expected error removing non-existent micro")
	}
}

func TestRoster_ListMicros(t *testing.T) {
	r := NewRoster(8.0)
	m1 := &Micro{ID: "m1", Role: RoleEngineer, Cost: 1.5, FullArena: false}
	m2 := &Micro{ID: "m2", Role: RoleReviewer, Cost: 1.0, FullArena: false}
	r.AddMicro(m1)
	r.AddMicro(m2)

	mics := r.ListMicros()
	if len(mics) != 2 {
		t.Fatalf("expected 2 micros, got %d", len(mics))
	}
	found := map[string]bool{}
	for _, m := range mics {
		found[m.ID] = true
	}
	if !found["m1"] || !found["m2"] {
		t.Fatal("expected micros m1 and m2 in list")
	}
}
