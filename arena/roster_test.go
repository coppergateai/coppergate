package arena

import (
	"testing"
)

func TestSpawnRoster_FullArenaAllowed(t *testing.T) {
	cfg := Config{
		MonthlyBudgetCents: 800, // $8
		AvailableMicros:    10,
		EngineerCount:      2,
		ReviewerCount:      2,
	}
	r, err := SpawnRoster(cfg)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if r.Type != FullArena {
		t.Errorf("expected FullArena roster, got %v", r.Type)
	}
	if r.Engineers != 2 || r.Reviewers != 2 {
		t.Errorf("unexpected engineer/reviewer count: %d/%d", r.Engineers, r.Reviewers)
	}
}

func TestSpawnRoster_LeanRosterUnderBudget(t *testing.T) {
	cfg := Config{
		MonthlyBudgetCents: 400, // $4, less than full arena $8
		AvailableMicros:    1,   // 1 micro under $2
		EngineerCount:      1,
		ReviewerCount:      1,
	}
	r, err := SpawnRoster(cfg)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if r.Type != LeanRoster {
		t.Errorf("expected LeanRoster, got %v", r.Type)
	}
	if r.SpawnedMicros != 1 {
		t.Errorf("expected 1 micro spawned, got %d", r.SpawnedMicros)
	}
}

func TestSpawnRoster_LeanRosterBudgetTooLow(t *testing.T) {
	cfg := Config{
		MonthlyBudgetCents: 100, // $1, less than $2 per micro
		AvailableMicros:    1,
		EngineerCount:      1,
		ReviewerCount:      1,
	}
	_, err := SpawnRoster(cfg)
	if err == nil {
		t.Fatal("expected error due to budget too low, got nil")
	}
}

func TestSpawnRoster_LeanRosterInsufficientStaff(t *testing.T) {
	cfg := Config{
		MonthlyBudgetCents: 400,
		AvailableMicros:    1,
		EngineerCount:      0,
		ReviewerCount:      1,
	}
	_, err := SpawnRoster(cfg)
	if err == nil {
		t.Fatal("expected error due to insufficient engineer count, got nil")
	}
}

func TestRosterManager_UpdateAndGet(t *testing.T) {
	rm := NewRosterManager()
	cfg := Config{
		MonthlyBudgetCents: 400,
		AvailableMicros:    2,
		EngineerCount:      1,
		ReviewerCount:      1,
	}
	err := rm.UpdateRoster(cfg)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	r := rm.GetRoster()
	if r == nil {
		t.Fatal("expected roster, got nil")
	}
	if r.Type != LeanRoster {
		t.Errorf("expected LeanRoster, got %v", r.Type)
	}
}
