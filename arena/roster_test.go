package arena

import (
	"testing"
)

func TestRoster_AddMicro(t *testing.T) {
	r := NewRoster(8.0, false)

	// Allowed micro under $2, Engineer role
	m1 := &Micro{ID: "m1", Cost: 1.99, Role: "Engineer", FullArena: false}
	if err := r.AddMicro(m1); err != nil {
		t.Fatalf("expected add micro success, got error: %v", err)
	}

	// Disallowed micro cost >= $2
	m2 := &Micro{ID: "m2", Cost: 2.0, Role: "Engineer", FullArena: false}
	if err := r.AddMicro(m2); err == nil {
		t.Fatal("expected error for micro cost >= $2, got nil")
	}

	// Disallowed role
	m3 := &Micro{ID: "m3", Cost: 1.5, Role: "FullArena", FullArena: false}
	if err := r.AddMicro(m3); err == nil {
		t.Fatal("expected error for disallowed role, got nil")
	}

	// Disallowed full arena spawn under tight budget
	m4 := &Micro{ID: "m4", Cost: 1.0, Role: "Engineer", FullArena: true}
	if err := r.AddMicro(m4); err != ErrFullArenaSpawnNotAllowed {
		t.Fatalf("expected ErrFullArenaSpawnNotAllowed, got %v", err)
	}

	// Add multiple micros until budget exceeded
	m5 := &Micro{ID: "m5", Cost: 3.0, Role: "Reviewer", FullArena: false}
	if err := r.AddMicro(m5); err == nil {
		t.Fatal("expected error for micro cost >= $2, got nil")
	}

	// Add multiple allowed micros to reach budget
	m6 := &Micro{ID: "m6", Cost: 1.5, Role: "Reviewer", FullArena: false}
	m7 := &Micro{ID: "m7", Cost: 1.5, Role: "Engineer", FullArena: false}
	if err := r.AddMicro(m6); err != nil {
		t.Fatalf("unexpected error adding m6: %v", err)
	}
	if err := r.AddMicro(m7); err != nil {
		t.Fatalf("unexpected error adding m7: %v", err)
	}

	// Adding another micro that would exceed budget
	m8 := &Micro{ID: "m8", Cost: 3.0, Role: "Engineer", FullArena: false}
	if err := r.AddMicro(m8); err == nil {
		t.Fatal("expected ErrBudgetExceeded, got nil")
	}
}

func TestRoster_RemoveMicro(t *testing.T) {
	r := NewRoster(8.0, false)
	m := &Micro{ID: "m1", Cost: 1.5, Role: "Engineer", FullArena: false}
	if err := r.AddMicro(m); err != nil {
		t.Fatalf("unexpected error adding micro: %v", err)
	}
	r.RemoveMicro("m1")
	if len(r.ListMicros()) != 0 {
		t.Fatal("expected roster to be empty after removal")
	}
	if r.spent != 0 {
		t.Fatalf("expected spent to be 0 after removal, got %f", r.spent)
	}
}

func TestRoster_ListMicros(t *testing.T) {
	r := NewRoster(8.0, false)
	m1 := &Micro{ID: "m1", Cost: 1.0, Role: "Engineer", FullArena: false}
	m2 := &Micro{ID: "m2", Cost: 1.5, Role: "Reviewer", FullArena: false}
	if err := r.AddMicro(m1); err != nil {
		t.Fatalf("unexpected error adding m1: %v", err)
	}
	if err := r.AddMicro(m2); err != nil {
		t.Fatalf("unexpected error adding m2: %v", err)
	}
	micros := r.ListMicros()
	if len(micros) != 2 {
		t.Fatalf("expected 2 micros, got %d", len(micros))
	}
}
