package arena

import (
	"testing"
)

func TestNewArenaBudgetExceeded(t *testing.T) {
	cfg := Config{
		MonthlyBudgetUSD: 1.0,  // less than cost per arena
		CostPerArenaUSD:  2.0,
		CostPerMicroUSD:  0.01,
	}
	_, err := NewArena(cfg)
	if err != ErrBudgetExceeded {
		t.Fatalf("expected ErrBudgetExceeded, got %v", err)
	}
}

func TestAllocMicroWithinBudget(t *testing.T) {
	cfg := Config{
		MonthlyBudgetUSD: 8.0,
		CostPerArenaUSD:  5.0,
		CostPerMicroUSD:  0.01,
	}
	a, err := NewArena(cfg)
	if err != nil {
		t.Fatalf("unexpected error creating arena: %v", err)
	}
	for i := 0; i < 100; i++ {
		buf, err := a.AllocMicro(10)
		if err != nil {
			t.Fatalf("unexpected error allocating micro: %v", err)
		}
		if len(buf) != 10 {
			t.Fatalf("expected buffer size 10, got %d", len(buf))
		}
	}
}

func TestAllocMicroBudgetExceeded(t *testing.T) {
	cfg := Config{
		MonthlyBudgetUSD: 0.15,
		CostPerArenaUSD:  5.0,
		CostPerMicroUSD:  0.01,
	}
	a, err := NewArena(cfg)
	if err != nil {
		t.Fatalf("unexpected error creating arena: %v", err)
	}
	// Allocate 10 bytes * 10 = 0.1 USD, should succeed
	for i := 0; i < 10; i++ {
		_, err := a.AllocMicro(10)
		if err != nil {
			t.Fatalf("unexpected error allocating micro: %v", err)
		}
	}
	// Next allocation should exceed budget
	_, err = a.AllocMicro(10)
	if err != ErrBudgetExceeded {
		t.Fatalf("expected ErrBudgetExceeded, got %v", err)
	}
}

func TestIsFullArena(t *testing.T) {
	cfg := Config{
		MonthlyBudgetUSD: 8.0,
		CostPerArenaUSD:  5.0,
		CostPerMicroUSD:  0.01,
	}
	a, err := NewArena(cfg)
	if err != nil {
		t.Fatalf("unexpected error creating arena: %v", err)
	}
	if a.IsFullArena() {
		t.Fatalf("expected IsFullArena false under lean arena")
	}
}

func TestReset(t *testing.T) {
	cfg := Config{
		MonthlyBudgetUSD: 8.0,
		CostPerArenaUSD:  5.0,
		CostPerMicroUSD:  0.01,
	}
	a, err := NewArena(cfg)
	if err != nil {
		t.Fatalf("unexpected error creating arena: %v", err)
	}
	_, err = a.AllocMicro(10)
	if err != nil {
		t.Fatalf("unexpected error allocating micro: %v", err)
	}
	a.Reset()
	if len(a.micros) != 0 {
		t.Fatalf("expected micros slice to be empty after reset")
	}
	if a.spentUSD != 0 {
		t.Fatalf("expected spentUSD to be zero after reset")
	}
}
