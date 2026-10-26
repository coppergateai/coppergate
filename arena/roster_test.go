package arena

import (
	"testing"
)

func TestNewRoster_LeanRoster(t *testing.T) {
	available := []Micro{
		{"micro1", 1.5, "Engineer"},
		{"micro2", 2.5, "Engineer"},
		{"micro3", 1.0, "Reviewer"},
		{"micro4", 3.0, "Reviewer"},
		{"micro5", 1.9, "Other"},
		{"micro6", 1.8, "Engineer"},
	}

	config := RosterConfig{
		BudgetMonthly: 8.0,
		AllowFullArena: false,
	}

	r, err := NewRoster(config, available, LeanRoster)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	expectedNames := map[string]bool{"micro1": true, "micro3": true, "micro6": true}
	if r.Count() != len(expectedNames) {
		t.Errorf("expected %d micros, got %d", len(expectedNames), r.Count())
	}

	for _, m := range r.Micros {
		if !expectedNames[m.Name] {
			t.Errorf("unexpected micro included: %v", m.Name)
		}
	}
}

func TestNewRoster_FullArenaAllowed(t *testing.T) {
	available := []Micro{
		{"micro1", 3.0, "Engineer"},
		{"micro2", 4.0, "Reviewer"},
	}

	config := RosterConfig{
		BudgetMonthly: 8.0,
		AllowFullArena: true,
	}

	r, err := NewRoster(config, available, FullArena)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if r.Count() != len(available) {
		t.Errorf("expected %d micros, got %d", len(available), r.Count())
	}
}

func TestNewRoster_FullArenaNotAllowed(t *testing.T) {
	available := []Micro{
		{"micro1", 3.0, "Engineer"},
		{"micro2", 4.0, "Reviewer"},
	}

	config := RosterConfig{
		BudgetMonthly: 8.0,
		AllowFullArena: false,
	}

	_, err := NewRoster(config, available, FullArena)
	if err == nil {
		t.Fatal("expected error due to budget, got nil")
	}
	if err != ErrBudgetExceeded {
		t.Fatalf("expected ErrBudgetExceeded, got %v", err)
	}
}
