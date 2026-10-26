package arena

import (
	"testing"
)

func TestSpawnRoster_EngineerLeanRosterUnderBudget(t *testing.T) {
	cfg := RosterConfig{
		BudgetDollars: 5.00,
		Role:          "Engineer",
		AllowFullArena: false,
	}
	roster, err := SpawnRoster(cfg)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if roster.Type != LeanRoster {
		t.Errorf("expected lean roster, got %v", roster.Type)
	}
	if roster.TotalCost > cfg.BudgetDollars {
		t.Errorf("roster cost %v exceeds budget %v", roster.TotalCost, cfg.BudgetDollars)
	}
	for _, m := range roster.Micros {
		if m.Cost >= 2.00 {
			t.Errorf("micro %s cost %v exceeds $2 limit for lean roster", m.Name, m.Cost)
		}
	}
}

func TestSpawnRoster_ReviewerLeanRosterUnderBudget(t *testing.T) {
	cfg := RosterConfig{
		BudgetDollars: 7.00,
		Role:          "Reviewer",
		AllowFullArena: false,
	}
	roster, err := SpawnRoster(cfg)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if roster.Type != LeanRoster {
		t.Errorf("expected lean roster, got %v", roster.Type)
	}
}

func TestSpawnRoster_UnauthorizedRole(t *testing.T) {
	cfg := RosterConfig{
		BudgetDollars: 10.00,
		Role:          "Intern",
		AllowFullArena: true,
	}
	_, err := SpawnRoster(cfg)
	if err == nil {
		t.Fatal("expected error for unauthorized role")
	}
}

func TestSpawnRoster_FullArenaAllowedAndBudgetSufficient(t *testing.T) {
	cfg := RosterConfig{
		BudgetDollars: 10.00,
		Role:          "Engineer",
		AllowFullArena: true,
	}
	roster, err := SpawnRoster(cfg)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if roster.Type != FullArena {
		t.Errorf("expected full arena roster, got %v", roster.Type)
	}
}

func TestSpawnRoster_FullArenaNotAllowedUnderTightBudget(t *testing.T) {
	cfg := RosterConfig{
		BudgetDollars: 7.00,
		Role:          "Engineer",
		AllowFullArena: true,
	}
	roster, err := SpawnRoster(cfg)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if roster.Type != LeanRoster {
		t.Errorf("expected lean roster under tight budget, got %v", roster.Type)
	}
}

func TestSpawnRoster_BudgetTooLow(t *testing.T) {
	cfg := RosterConfig{
		BudgetDollars: 1.00,
		Role:          "Engineer",
		AllowFullArena: false,
	}
	_, err := SpawnRoster(cfg)
	if err != ErrBudgetExceeded {
		t.Fatalf("expected ErrBudgetExceeded, got %v", err)
	}
}
