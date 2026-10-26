package arena

import (
	"testing"
)

func TestNewRoster_LeanUnderBudget(t *testing.T) {
	cfg := RosterConfig{
		MonthlyBudgetUSD:      8,
		MicrosCostPerEngineer: 1_000_000, // $1 per engineer+reviewer pair
		RequestedRosterType:   LeanRoster,
	}
	// 1 engineer + 1 reviewer = 2 pairs * $1 = $2 micros cost
	r, err := NewRoster(cfg, 1, 1)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !r.IsLean() {
		t.Errorf("expected lean roster, got %v", r.Type)
	}
	if r.TotalCost != 2_000_000 {
		t.Errorf("expected total cost 2,000,000 micros, got %d", r.TotalCost)
	}
}

func TestNewRoster_LeanOverBudgetFallbackFull(t *testing.T) {
	cfg := RosterConfig{
		MonthlyBudgetUSD:      8,
		MicrosCostPerEngineer: 1_500_000, // $1.5 per engineer+reviewer pair
		RequestedRosterType:   LeanRoster,
	}
	// 1 engineer + 1 reviewer = 2 pairs * $1.5 = $3 micros cost > $2 lean limit
	// But total cost $3 < $8 budget, so fallback to full arena
	r, err := NewRoster(cfg, 1, 1)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !r.IsFullArena() {
		t.Errorf("expected full arena roster fallback, got %v", r.Type)
	}
	if r.TotalCost != 3_000_000 {
		t.Errorf("expected total cost 3,000,000 micros, got %d", r.TotalCost)
	}
}

func TestNewRoster_FullArenaOverBudget(t *testing.T) {
	cfg := RosterConfig{
		MonthlyBudgetUSD:      2,
		MicrosCostPerEngineer: 2_000_000, // $2 per engineer+reviewer pair
		RequestedRosterType:   FullArenaRoster,
	}
	// 2 engineers + 2 reviewers = 4 pairs * $2 = $8 micros cost > $2 budget
	_, err := NewRoster(cfg, 2, 2)
	if err != ErrBudgetExceeded {
		t.Fatalf("expected ErrBudgetExceeded, got %v", err)
	}
}

func TestNewRoster_DefaultFullArenaWithinBudget(t *testing.T) {
	cfg := RosterConfig{
		MonthlyBudgetUSD:      8,
		MicrosCostPerEngineer: 1_000_000,
		RequestedRosterType:   99, // unknown, defaults to full arena
	}
	r, err := NewRoster(cfg, 2, 2)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !r.IsFullArena() {
		t.Errorf("expected full arena roster, got %v", r.Type)
	}
	if r.TotalCost != 4_000_000 {
		t.Errorf("expected total cost 4,000,000 micros, got %d", r.TotalCost)
	}
}
