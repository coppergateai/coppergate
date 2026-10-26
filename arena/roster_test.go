package arena

import (
	"testing"
)

func TestSpawnRoster_FullArenaAllowed(t *testing.T) {
	micros := []Micro{
		{Name: "micro1", Cost: 3.0, Role: "Engineer"},
		{Name: "micro2", Cost: 1.5, Role: "Reviewer"},
		{Name: "micro3", Cost: 2.5, Role: "Other"},
	}
	cfg := RosterConfig{
		Budget:         10,
		AvailableMicros: micros,
		AllowFullArena: true,
	}
	roster, err := SpawnRoster(cfg)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if roster.Type != FullArena {
		t.Errorf("expected FullArena roster, got %v", roster.Type)
	}
	if len(roster.Micros) != len(micros) {
		t.Errorf("expected %d micros, got %d", len(micros), len(roster.Micros))
	}
}

func TestSpawnRoster_LeanRosterUnderBudget(t *testing.T) {
	micros := []Micro{
		{Name: "micro1", Cost: 1.9, Role: "Engineer"},
		{Name: "micro2", Cost: 1.5, Role: "Reviewer"},
		{Name: "micro3", Cost: 2.5, Role: "Engineer"},
		{Name: "micro4", Cost: 1.0, Role: "Other"},
	}
	cfg := RosterConfig{
		Budget:         5,
		AvailableMicros: micros,
		AllowFullArena: false,
	}
	roster, err := SpawnRoster(cfg)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if roster.Type != LeanRoster {
		t.Errorf("expected LeanRoster, got %v", roster.Type)
	}
	// Expect only micro1 and micro2 included (under $2 and role Engineer or Reviewer)
	expectedNames := map[string]bool{"micro1": true, "micro2": true}
	if len(roster.Micros) != 2 {
		t.Errorf("expected 2 micros, got %d", len(roster.Micros))
	}
	for _, m := range roster.Micros {
		if !expectedNames[m.Name] {
			t.Errorf("unexpected micro %s in lean roster", m.Name)
		}
	}
}

func TestSpawnRoster_NoSuitableLeanMicros(t *testing.T) {
	micros := []Micro{
		{Name: "micro1", Cost: 2.5, Role: "Engineer"},
		{Name: "micro2", Cost: 3.0, Role: "Reviewer"},
		{Name: "micro3", Cost: 1.0, Role: "Other"},
	}
	cfg := RosterConfig{
		Budget:         5,
		AvailableMicros: micros,
		AllowFullArena: false,
	}
	_, err := SpawnRoster(cfg)
	if err == nil {
		t.Fatalf("expected error due to no suitable lean micros")
	}
}

func TestSpawnRoster_InvalidBudget(t *testing.T) {
	micros := []Micro{
		{Name: "micro1", Cost: 1.0, Role: "Engineer"},
	}
	cfg := RosterConfig{
		Budget:         0,
		AvailableMicros: micros,
		AllowFullArena: false,
	}
	_, err := SpawnRoster(cfg)
	if err == nil {
		t.Fatalf("expected error due to zero budget")
	}
}

func TestSpawnRoster_NoAvailableMicros(t *testing.T) {
	cfg := RosterConfig{
		Budget:         10,
		AvailableMicros: []Micro{},
		AllowFullArena: true,
	}
	_, err := SpawnRoster(cfg)
	if err == nil {
		t.Fatalf("expected error due to no available micros")
	}
}
