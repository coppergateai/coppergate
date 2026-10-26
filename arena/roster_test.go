package arena

import (
	"testing"
)

func TestNewRoster_LeanRosterAllowed(t *testing.T) {
	cfg := Config{
		AvailableMicros: 1_500_000, // 1.5 seconds
		MonthlyEnvelope: 5,         // under $8 monthly budget
		UserRole:        RoleEngineer,
	}
	r, err := NewRoster(cfg)
	if err != nil {
		t.Fatalf("expected lean roster allocation, got error: %v", err)
	}
	if !r.IsLean() {
		t.Errorf("expected lean roster, got full arena")
	}
	if r.IsFullArena() {
		t.Errorf("expected no full arena spawn under tight budget")
	}
}

func TestNewRoster_LeanRosterReviewerAllowed(t *testing.T) {
	cfg := Config{
		AvailableMicros: 1_000_000,
		MonthlyEnvelope: 3,
		UserRole:        RoleReviewer,
	}
	r, err := NewRoster(cfg)
	if err != nil {
		t.Fatalf("expected lean roster allocation for reviewer, got error: %v", err)
	}
	if !r.IsLean() {
		t.Errorf("expected lean roster for reviewer")
	}
}

func TestNewRoster_LeanRosterDeniedForGuest(t *testing.T) {
	cfg := Config{
		AvailableMicros: 1_000_000,
		MonthlyEnvelope: 3,
		UserRole:        RoleGuest,
	}
	_, err := NewRoster(cfg)
	if err == nil {
		t.Fatalf("expected error for guest role under tight budget")
	}
}

func TestNewRoster_FullArenaAllowedAboveBudget(t *testing.T) {
	cfg := Config{
		AvailableMicros: 500_000, // under 2 seconds but monthly envelope >= 8
		MonthlyEnvelope: 10,
		UserRole:        RoleGuest,
	}
	r, err := NewRoster(cfg)
	if err != nil {
		t.Fatalf("expected full arena allocation above budget, got error: %v", err)
	}
	if !r.IsFullArena() {
		t.Errorf("expected full arena spawn")
	}
	if r.IsLean() {
		t.Errorf("expected full arena, not lean")
	}
}

func TestAddEntryAndEntries(t *testing.T) {
	cfg := Config{
		AvailableMicros: 3_000_000,
		MonthlyEnvelope: 10,
		UserRole:        RoleEngineer,
	}
	r, err := NewRoster(cfg)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	r.AddEntry("entry1")
	r.AddEntry("entry2")

	entries := r.Entries()
	if len(entries) != 2 {
		t.Errorf("expected 2 entries, got %d", len(entries))
	}
	if entries[0] != "entry1" || entries[1] != "entry2" {
		t.Errorf("entries mismatch: %v", entries)
	}
}
