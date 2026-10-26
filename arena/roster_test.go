package arena

import (
	"testing"
)

func TestNewRoster_LeanRosterAllowed(t *testing.T) {
	cfg := RosterConfig{
		MonthlyBudgetCents: 800,
		AvailableMicros:    1_500_000, // under $2
	}
	r, err := NewRoster(cfg)
	if err != nil {
		t.Fatalf("expected lean roster, got error: %v", err)
	}
	if r == nil {
		t.Fatal("expected roster instance, got nil")
	}
}

func TestNewRoster_FullArenaRefused(t *testing.T) {
	cfg := RosterConfig{
		MonthlyBudgetCents: 800,
		AvailableMicros:    3_000_000, // over $2
	}
	r, err := NewRoster(cfg)
	if err != ErrBudgetExceeded {
		t.Fatalf("expected ErrBudgetExceeded, got %v", err)
	}
	if r != nil {
		t.Fatal("expected nil roster on budget exceed")
	}
}

func TestNewRoster_BudgetTooLow(t *testing.T) {
	cfg := RosterConfig{
		MonthlyBudgetCents: 700,       // under $8
		AvailableMicros:    1_000_000, // under $2
	}
	r, err := NewRoster(cfg)
	if err != ErrBudgetExceeded {
		t.Fatalf("expected ErrBudgetExceeded, got %v", err)
	}
	if r != nil {
		t.Fatal("expected nil roster on low budget")
	}
}

func TestRoster_AddEntryAndCapacity(t *testing.T) {
	cfg := RosterConfig{
		MonthlyBudgetCents: 800,
		AvailableMicros:    1_000_000,
	}
	r, err := NewRoster(cfg)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	for i := 0; i < r.capacity; i++ {
		err := r.AddEntry(
			"id"+string(i),
			"engineer"+string(i),
			"reviewer"+string(i),
		)
		if err != nil {
			t.Fatalf("unexpected error adding entry %d: %v", i, err)
		}
	}
	err = r.AddEntry("overflow", "eng", "rev")
	if err == nil {
		t.Fatal("expected error on capacity overflow, got none")
	}
}

func TestRoster_EntriesCopy(t *testing.T) {
	cfg := RosterConfig{
		MonthlyBudgetCents: 800,
		AvailableMicros:    1_000_000,
	}
	r, err := NewRoster(cfg)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	r.AddEntry("id1", "eng1", "rev1")
	entries := r.Entries()
	if len(entries) != 1 {
		t.Fatalf("expected 1 entry, got %d", len(entries))
	}
	entries[0].Engineer = "changed"
	// Ensure original is not changed
	orig := r.Entries()
	if orig[0].Engineer == "changed" {
		t.Fatal("entries copy is not deep")
	}
}
