package arena

import (
	"testing"
)

func TestNewArena_FullArenaBudgetExceeded(t *testing.T) {
	cfg := RosterConfig{
		Budget: Budget{Monthly: 1.99},
		Mode:   FullArena,
	}
	_, err := NewArena(cfg)
	if err != ErrBudgetExceeded {
		t.Fatalf("expected ErrBudgetExceeded, got %v", err)
	}
}

func TestNewArena_LeanRosterAllowed(t *testing.T) {
	cfg := RosterConfig{
		Budget:         Budget{Monthly: 2.0},
		Mode:           LeanRoster,
		AvailableMicros: 1.5,
	}
	a, err := NewArena(cfg)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if a.Mode() != LeanRoster {
		t.Fatalf("expected LeanRoster mode, got %v", a.Mode())
	}
}

func TestNewArena_FullArenaAllowed(t *testing.T) {
	cfg := RosterConfig{
		Budget: Budget{Monthly: 8.0},
		Mode:   FullArena,
	}
	a, err := NewArena(cfg)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if a.Mode() != FullArena {
		t.Fatalf("expected FullArena mode, got %v", a.Mode())
	}
}

func TestAllocate_LeanRosterLimit(t *testing.T) {
	cfg := RosterConfig{
		Budget:         Budget{Monthly: 2.0},
		Mode:           LeanRoster,
		AvailableMicros: 1.0,
	}
	a, err := NewArena(cfg)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	_, err = a.Allocate(2048)
	if err == nil {
		t.Fatalf("expected allocation error for large size in lean roster")
	}
	// Small allocation should succeed
	buf, err := a.Allocate(512)
	if err != nil {
		t.Fatalf("unexpected allocation error: %v", err)
	}
	if len(buf) != 512 {
		t.Fatalf("expected buffer size 512, got %d", len(buf))
	}
}
