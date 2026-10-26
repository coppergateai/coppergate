package arena

import (
	"testing"
)

func TestSpawnRoster_LeanRosterUnderBudget(t *testing.T) {
	budget := 8.0
	r, err := SpawnRoster(budget, LeanRoster)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	members := r.Members()
	if len(members) != 2 {
		t.Fatalf("expected 2 members, got %d", len(members))
	}
	for _, m := range members {
		if m.Micro > 2.0 {
			t.Errorf("member %s micro cost %f exceeds $2", m.ID, m.Micro)
		}
		if m.Role != Engineer && m.Role != Reviewer {
			t.Errorf("member %s role %s not Engineer or Reviewer", m.ID, m.Role)
		}
	}
}

func TestSpawnRoster_FullArenaBudgetTooTight(t *testing.T) {
	budget := 8.0
	_, err := SpawnRoster(budget, FullArena)
	if err == nil {
		t.Fatal("expected ErrBudgetExceeded error but got nil")
	}
	if err != ErrBudgetExceeded {
		t.Fatalf("expected ErrBudgetExceeded, got %v", err)
	}
}

func TestSpawnRoster_FullArenaSufficientBudget(t *testing.T) {
	budget := 10.0
	r, err := SpawnRoster(budget, FullArena)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	members := r.Members()
	if len(members) < 3 {
		t.Fatalf("expected at least 3 members, got %d", len(members))
	}
	foundQA := false
	for _, m := range members {
		if m.Role == "QA" {
			foundQA = true
		}
	}
	if !foundQA {
		t.Error("expected QA member in full arena roster")
	}
}
