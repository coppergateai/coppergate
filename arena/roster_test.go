package arena

import (
	"testing"
)

func TestSpawnRoster_LeanRoster(t *testing.T) {
	micros := []Micro{
		{Name: "eng1", Cost: 1.5, Role: "Engineer", FullSpawn: false},
		{Name: "rev1", Cost: 1.0, Role: "Reviewer", FullSpawn: false},
		{Name: "other1", Cost: 1.0, Role: "Other", FullSpawn: false},
		{Name: "full1", Cost: 1.5, Role: "Engineer", FullSpawn: true},
		{Name: "expensive", Cost: 3.0, Role: "Engineer", FullSpawn: false},
	}

	cfg := Config{
		BudgetMonthly: 8,
		AllowedRoles: map[string]bool{
			"Engineer": true,
			"Reviewer": true,
		},
		MaxMicroCost: 2.0,
	}

	roster, rtype, err := SpawnRoster(micros, cfg)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if rtype != LeanRoster {
		t.Errorf("expected LeanRoster, got %v", rtype)
	}
	if len(roster.Micros) != 2 {
		t.Errorf("expected 2 micros in lean roster, got %d", len(roster.Micros))
	}
	for _, m := range roster.Micros {
		if m.Role != "Engineer" && m.Role != "Reviewer" {
			t.Errorf("unexpected role %s in lean roster", m.Role)
		}
		if m.FullSpawn {
			t.Errorf("full spawn micro %s included in lean roster", m.Name)
		}
		if m.Cost > 2.0 {
			t.Errorf("micro %s cost %f exceeds max cost", m.Name, m.Cost)
		}
	}
}

func TestSpawnRoster_FullArena(t *testing.T) {
	micros := []Micro{
		{Name: "eng1", Cost: 1.5, Role: "Engineer", FullSpawn: false},
		{Name: "rev1", Cost: 1.0, Role: "Reviewer", FullSpawn: false},
		{Name: "other1", Cost: 1.0, Role: "Other", FullSpawn: false},
		{Name: "full1", Cost: 1.5, Role: "Engineer", FullSpawn: true},
		{Name: "expensive", Cost: 3.0, Role: "Engineer", FullSpawn: false},
	}

	cfg := Config{
		BudgetMonthly: 10, // above tight budget
		AllowedRoles: map[string]bool{
			"Engineer": true,
			"Reviewer": true,
		},
		MaxMicroCost: 2.0,
	}

	roster, rtype, err := SpawnRoster(micros, cfg)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if rtype != FullArena {
		t.Errorf("expected FullArena, got %v", rtype)
	}
	if len(roster.Micros) != len(micros) {
		t.Errorf("expected full roster micros %d, got %d", len(micros), len(roster.Micros))
	}
}

func TestSpawnRoster_InvalidBudget(t *testing.T) {
	micros := []Micro{}
	cfg := Config{
		BudgetMonthly: -1,
		AllowedRoles:  map[string]bool{"Engineer": true, "Reviewer": true},
		MaxMicroCost:  2.0,
	}
	_, _, err := SpawnRoster(micros, cfg)
	if err == nil {
		t.Errorf("expected error for invalid budget")
	}
}
