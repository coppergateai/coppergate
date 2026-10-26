package arena

import (
	"testing"
)

func TestArenaAllocWithinCapacity(t *testing.T) {
	const capacity = 1024
	a := New(capacity)

	mem, err := a.Alloc(512)
	if err != nil {
		t.Fatalf("unexpected error allocating 512 bytes: %v", err)
	}
	if len(mem) != 512 {
		t.Fatalf("expected 512 bytes allocated, got %d", len(mem))
	}

	mem2, err := a.Alloc(512)
	if err != nil {
		t.Fatalf("unexpected error allocating second 512 bytes: %v", err)
	}
	if len(mem2) != 512 {
		t.Fatalf("expected 512 bytes allocated, got %d", len(mem2))
	}

	// Next allocation should fail due to capacity exceeded
	_, err = a.Alloc(1)
	if err != ErrFullArena {
		t.Fatalf("expected ErrFullArena, got %v", err)
	}
}

func TestArenaAllocZeroOrNegative(t *testing.T) {
	a := New(100)
	_, err := a.Alloc(0)
	if err == nil {
		t.Fatal("expected error allocating zero bytes")
	}
	_, err = a.Alloc(-1)
	if err == nil {
		t.Fatal("expected error allocating negative bytes")
	}
}

func TestArenaReset(t *testing.T) {
	a := New(100)
	_, err := a.Alloc(100)
	if err != nil {
		t.Fatalf("unexpected error allocating 100 bytes: %v", err)
	}

	_, err = a.Alloc(1)
	if err != ErrFullArena {
		t.Fatalf("expected ErrFullArena before reset, got %v", err)
	}

	a.Reset()

	mem, err := a.Alloc(100)
	if err != nil {
		t.Fatalf("unexpected error allocating 100 bytes after reset: %v", err)
	}
	if len(mem) != 100 {
		t.Fatalf("expected 100 bytes allocated after reset, got %d", len(mem))
	}
}
