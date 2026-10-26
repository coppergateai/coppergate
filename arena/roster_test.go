package arena

import (
	"testing"
)

func TestArenaLeanRosterSelection(t *testing.T) {
	budget := NewBudget(1_500_000) // under $2
	arena := NewArena(budget, 10)
	if arena.Type() != LEAN_ROSTER {
		t.Fatalf("expected LEAN_ROSTER, got %v", arena.Type())
	}
}

func TestArenaFullArenaSelection(t *testing.T) {
	budget := NewBudget(3_000_000) // over $2
	arena := NewArena(budget, 10)
	if arena.Type() != FULL_ARENA {
		t.Fatalf("expected FULL_ARENA, got %v", arena.Type())
	}
}

func TestAddEntryLeanRoster(t *testing.T) {
	budget := NewBudget(2_000_000)
	arena := NewArena(budget, 5)
	if arena.Type() != LEAN_ROSTER {
		t.Fatalf("expected LEAN_ROSTER, got %v", arena.Type())
	}
	err := arena.AddEntry("user1")
	if err != nil {
		t.Fatalf("unexpected error adding entry: %v", err)
	}
	entries := arena.Entries()
	if len(entries) != 1 || entries[0] != "user1" {
		t.Fatalf("unexpected entries: %v", entries)
	}
}

func TestAddEntryFullArenaDisallowed(t *testing.T) {
	budget := NewBudget(3_000_000)
	arena := NewArena(budget, 5)
	if arena.Type() != FULL_ARENA {
		t.Fatalf("expected FULL_ARENA, got %v", arena.Type())
	}
	err := arena.AddEntry("user1")
	if err == nil {
		t.Fatalf("expected error adding entry in FULL_ARENA mode")
	}
}

func TestBudgetExceeded(t *testing.T) {
	budget := NewBudget(1000) // very low budget
	arena := NewArena(budget, 5)
	if arena.Type() != LEAN_ROSTER {
		t.Fatalf("expected LEAN_ROSTER, got %v", arena.Type())
	}
	err := arena.AddEntry("user1")
	if err != nil {
		t.Fatalf("unexpected error adding first entry: %v", err)
	}
	err = arena.AddEntry("user2")
	if err == nil {
		t.Fatalf("expected budget exceeded error")
	}
}
