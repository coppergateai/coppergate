package arena

import (
	"testing"
)

func TestAllocateRoster_LeanRosterUnderBudget(t *testing.T) {
	cfg := RosterConfig{
		MonthlyBudgetCents: 800,          // $8 budget (tight)
		AvailableMicros:    1_500_000,    // under $2 micros limit
		Role:               "Engineer",
	}

	r, err := AllocateRoster(cfg)
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if r.Type != LeanRoster {
		t.Errorf("expected lean roster, got %v", r.Type)
	}
	if r.Engineers != 1 || r.Reviewers != 1 {
		t.Errorf("expected 1 engineer and 1 reviewer, got %d engineers and %d reviewers", r.Engineers, r.Reviewers)
	}
}

func TestAllocateRoster_LeanRosterReviewerRole(t *testing.T) {
	cfg := RosterConfig{
		MonthlyBudgetCents: 800,
		AvailableMicros:    1_000_000,
		Role:               "Reviewer",
	}

	r, err := AllocateRoster(cfg)
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if r.Type != LeanRoster {
		t.Errorf("expected lean roster, got %v", r.Type)
	}
}

func TestAllocateRoster_FullArenaDeniedUnderTightBudget(t *testing.T) {
	cfg := RosterConfig{
		MonthlyBudgetCents: 800,
		AvailableMicros:    3_000_000, // above lean limit
		Role:               "Engineer",
	}

	_, err := AllocateRoster(cfg)
	if err != ErrBudgetExceeded {
		t.Fatalf("expected ErrBudgetExceeded, got %v", err)
	}
}

func TestAllocateRoster_FullArenaAllowedAboveBudget(t *testing.T) {
	cfg := RosterConfig{
		MonthlyBudgetCents: 1000,        // above $8 budget
		AvailableMicros:    5_000_000,
		Role:               "Engineer",
	}

	r, err := AllocateRoster(cfg)
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if r.Type != FullArenaRoster {
		t.Errorf("expected full arena roster, got %v", r.Type)
	}
	if r.Engineers != 5 || r.Reviewers != 3 {
		t.Errorf("expected 5 engineers and 3 reviewers, got %d engineers and %d reviewers", r.Engineers, r.Reviewers)
	}
}

func TestAllocateRoster_NonEngineerReviewerRoleDeniedLean(t *testing.T) {
	cfg := RosterConfig{
		MonthlyBudgetCents: 800,
		AvailableMicros:    1_000_000,
		Role:               "Manager",
	}

	_, err := AllocateRoster(cfg)
	if err != ErrBudgetExceeded {
		t.Fatalf("expected ErrBudgetExceeded for non-engineer/reviewer role, got %v", err)
	}
}
