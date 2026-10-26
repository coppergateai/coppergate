package arena

import (
	"testing"
)

func TestNewArena_LeanRosterUnderBudget(t *testing.T) {
	cfg := ArenaConfig{
		BudgetEnvelope:      8.0,
		MicrosRequested:     3, // 3 * 0.5 = $1.5 < $2
		EngineerReviewerOnly: true,
	}
	a, err := NewArena(cfg)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if a.Type != LEAN_ROSTER {
		t.Errorf("expected LEAN_ROSTER, got %v", a.TypeString())
	}
	if a.micros != 3 {
		t.Errorf("expected 3 micros, got %d", a.micros)
	}
}

func TestNewArena_LeanRosterOverBudget(t *testing.T) {
	cfg := ArenaConfig{
		BudgetEnvelope:      1.0,
		MicrosRequested:     3, // cost $1.5 > budget $1.0
		EngineerReviewerOnly: true,
	}
	_, err := NewArena(cfg)
	if err != ErrBudgetExceeded {
		t.Errorf("expected ErrBudgetExceeded, got %v", err)
	}
}

func TestNewArena_FullArenaUnderBudget(t *testing.T) {
	cfg := ArenaConfig{
		BudgetEnvelope:      8.0,
		MicrosRequested:     10, // cost $5.0 < $8.0
		EngineerReviewerOnly: false,
	}
	a, err := NewArena(cfg)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if a.Type != FULL_ARENA {
		t.Errorf("expected FULL_ARENA, got %v", a.TypeString())
	}
	if a.micros != 10 {
		t.Errorf("expected 10 micros, got %d", a.micros)
	}
}

func TestNewArena_FullArenaOverBudget(t *testing.T) {
	cfg := ArenaConfig{
		BudgetEnvelope:      4.0,
		MicrosRequested:     10, // cost $5.0 > budget $4.0
		EngineerReviewerOnly: false,
	}
	_, err := NewArena(cfg)
	if err != ErrBudgetExceeded {
		t.Errorf("expected ErrBudgetExceeded, got %v", err)
	}
}
