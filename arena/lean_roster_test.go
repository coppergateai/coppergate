package arena

import (
	"testing"
)

func TestNewArena_LeanRosterEnabled(t *testing.T) {
	cfg := Config{
		AvailableMicros: 1_500_000, // under $2
		Role:            RoleEngineer,
		MonthlyEnvelope: 800, // $8
	}
	a, err := NewArena(cfg)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !a.IsLean() {
		t.Errorf("expected lean mode enabled for engineer under budget")
	}
}

func TestNewArena_LeanRosterDisabledForRole(t *testing.T) {
	cfg := Config{
		AvailableMicros: 1_500_000,
		Role:            RoleOther,
		MonthlyEnvelope: 800,
	}
	a, err := NewArena(cfg)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if a.IsLean() {
		t.Errorf("expected lean mode disabled for non-engineer/reviewer role")
	}
}

func TestNewArena_LeanRosterDisabledForBudget(t *testing.T) {
	cfg := Config{
		AvailableMicros: 3_000_000, // over $2
		Role:            RoleEngineer,
		MonthlyEnvelope: 800,
	}
	a, err := NewArena(cfg)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if a.IsLean() {
		t.Errorf("expected lean mode disabled for budget over $2")
	}
}

func TestAlloc_LeanModeAllocations(t *testing.T) {
	cfg := Config{
		AvailableMicros: 1_000_000,
		Role:            RoleReviewer,
		MonthlyEnvelope: 800,
	}
	a, err := NewArena(cfg)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !a.IsLean() {
		t.Fatalf("expected lean mode enabled")
	}

	b1 := a.Alloc(100)
	if len(b1) != 100 {
		t.Errorf("expected allocation size 100, got %d", len(b1))
	}
	b2 := a.Alloc(200)
	if len(b2) != 200 {
		t.Errorf("expected allocation size 200, got %d", len(b2))
	}
}

func TestAlloc_NormalModeAllocations(t *testing.T) {
	cfg := Config{
		AvailableMicros: 3_000_000,
		Role:            RoleEngineer,
		MonthlyEnvelope: 800,
	}
	a, err := NewArena(cfg)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if a.IsLean() {
		t.Fatalf("expected lean mode disabled")
	}

	b1 := a.Alloc(100)
	if len(b1) != 100 {
		t.Errorf("expected allocation size 100, got %d", len(b1))
	}
	b2 := a.Alloc(200)
	if len(b2) != 200 {
		t.Errorf("expected allocation size 200, got %d", len(b2))
	}
}
