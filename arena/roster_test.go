package arena

import (
	"testing"
)

func TestSpawnRosterLeanSuccess(t *testing.T) {
	budget := 8.0
	r, err := SpawnRoster(LeanRoster, budget)
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if r.Type != LeanRoster {
		t.Errorf("expected roster type LeanRoster, got %v", r.Type)
	}
	for _, m := range r.Members {
		if m.Micro >= 2.0 {
			t.Errorf("member %s has micro %v, expected under 2.0", m.Name, m.Micro)
		}
		if m.Role != Engineer && m.Role != Reviewer {
			t.Errorf("member %s has role %v, expected Engineer or Reviewer", m.Name, m.Role)
		}
	}
}

func TestSpawnRosterLeanBudgetExceeded(t *testing.T) {
	budget := 3.0 // less than sum of lean members
	_, err := SpawnRoster(LeanRoster, budget)
	if err == nil {
		t.Fatal("expected budget exceeded error, got nil")
	}
	if err != ErrBudgetExceeded {
		t.Fatalf("expected ErrBudgetExceeded, got %v", err)
	}
}

func TestSpawnRosterFullArenaDisallowedUnderTightBudget(t *testing.T) {
	budget := 8.0
	_, err := SpawnRoster(FullArena, budget)
	if err == nil {
		t.Fatal("expected budget exceeded error for full arena under tight budget, got nil")
	}
	if err != ErrBudgetExceeded {
		t.Fatalf("expected ErrBudgetExceeded, got %v", err)
	}
}

func TestSpawnRosterFullArenaAllowedOverBudget(t *testing.T) {
	budget := 15.0
	r, err := SpawnRoster(FullArena, budget)
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if r.Type != FullArena {
		t.Errorf("expected roster type FullArena, got %v", r.Type)
	}
}

func TestRosterManagerGetRosterCaching(t *testing.T) {
	rm := NewRosterManager(8.0)
	r1, err := rm.GetRoster(LeanRoster)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	r2, err := rm.GetRoster(LeanRoster)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if r1 != r2 {
		t.Errorf("expected cached roster instance, got different instances")
	}
}

func TestRosterManagerGetRosterDifferentType(t *testing.T) {
	rm := NewRosterManager(15.0)
	r1, err := rm.GetRoster(LeanRoster)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	r2, err := rm.GetRoster(FullArena)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if r1 == r2 {
		t.Errorf("expected different roster instances for different types")
	}
}
