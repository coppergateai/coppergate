package arena

import (
	"testing"
)

func TestSpawnRoster_LeanRosterUnderBudget(t *testing.T) {
	cfg := Config{
		MonthlyBudgetCents: 800,
		AvailableMicros:    150,
		Role:               "engineer",
	}
	r, err := SpawnRoster(cfg)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if r.Type != LeanRoster {
		t.Errorf("expected lean roster, got %v", r.Type)
	}
	if r.Micros != 150 {
		t.Errorf("expected micros 150, got %d", r.Micros)
	}
}

func TestSpawnRoster_FullArenaAllowed(t *testing.T) {
	cfg := Config{
		MonthlyBudgetCents: 800,
		AvailableMicros:    500,
		Role:               "engineer",
	}
	r, err := SpawnRoster(cfg)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if r.Type != FullArena {
		t.Errorf("expected full arena, got %v", r.Type)
	}
}

func TestSpawnRoster_FullArenaDisallowedUnderBudget(t *testing.T) {
	cfg := Config{
		MonthlyBudgetCents: 700,
		AvailableMicros:    500,
		Role:               "engineer",
	}
	_, err := SpawnRoster(cfg)
	if err == nil {
		t.Fatal("expected error for budget exceeded, got nil")
	}
	if err != ErrBudgetExceeded {
		t.Fatalf("expected ErrBudgetExceeded, got %v", err)
	}
}

func TestSpawnRoster_LeanRosterReviewerUnderBudget(t *testing.T) {
	cfg := Config{
		MonthlyBudgetCents: 800,
		AvailableMicros:    100,
		Role:               "reviewer",
	}
	r, err := SpawnRoster(cfg)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if r.Type != LeanRoster {
		t.Errorf("expected lean roster, got %v", r.Type)
	}
}

func TestSpawnRoster_LeanRosterNonEngineerReviewer(t *testing.T) {
	cfg := Config{
		MonthlyBudgetCents: 800,
		AvailableMicros:    100,
		Role:               "admin",
	}
	r, err := SpawnRoster(cfg)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	// Should spawn full arena because role is not engineer/reviewer
	if r.Type != FullArena {
		t.Errorf("expected full arena, got %v", r.Type)
	}
}
