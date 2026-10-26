package arena

import (
	"testing"
)

func TestSpawnRoster_LeanRosterUnderBudget(t *testing.T) {
	cfg := RosterConfig{
		Engineers: 2,
		Reviewers: 1,
		Budget:    8, // $8 budget
	}
	r, err := SpawnRoster(cfg)
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if r.Type != LeanRoster {
		t.Errorf("expected LeanRoster type, got %v", r.Type)
	}
	if r.Engineers != 2 || r.Reviewers != 1 {
		t.Errorf("unexpected roster composition: %+v", r)
	}
}

func TestSpawnRoster_BudgetTooLow(t *testing.T) {
	cfg := RosterConfig{
		Engineers: 1,
		Reviewers: 1,
		Budget:    1, // $1 budget, less than $2 minimum
	}
	_, err := SpawnRoster(cfg)
	if err != ErrBudgetExceeded {
		t.Fatalf("expected ErrBudgetExceeded, got %v", err)
	}
}

func TestSpawnRoster_LeanRosterCostExceedsBudget(t *testing.T) {
	cfg := RosterConfig{
		Engineers: 3,
		Reviewers: 2,
		Budget:    8, // $8 budget but cost is 5 * $2 = $10
	}
	_, err := SpawnRoster(cfg)
	if err != ErrBudgetExceeded {
		t.Fatalf("expected ErrBudgetExceeded due to budget, got %v", err)
	}
}

func TestRosterManager_GetOrSpawnRoster(t *testing.T) {
	rm := NewRosterManager()
	cfg := RosterConfig{
		Engineers: 1,
		Reviewers: 1,
		Budget:    6,
	}
	r1, err := rm.GetOrSpawnRoster(cfg)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	r2, err := rm.GetOrSpawnRoster(cfg)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if r1 != r2 {
		t.Errorf("expected same roster instance, got different")
	}
}
