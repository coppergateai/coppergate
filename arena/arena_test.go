package arena

import (
	"testing"
)

func TestLeanArenaAllocFree(t *testing.T) {
	a, err := NewLeanArena(RoleEngineer, 8.0)
	if err != nil {
		t.Fatalf("unexpected error creating lean arena: %v", err)
	}

	buf := a.Alloc(100)
	if buf == nil {
		t.Fatal("expected non-nil buffer for size 100")
	}
	if len(buf) != 100 {
		t.Errorf("expected buffer length 100, got %d", len(buf))
	}

	// Alloc too large should return nil
	buf2 := a.Alloc(5000)
	if buf2 != nil {
		t.Errorf("expected nil buffer for large alloc, got %v", buf2)
	}

	// Alloc zero or negative should return nil
	buf3 := a.Alloc(0)
	if buf3 != nil {
		t.Errorf("expected nil buffer for zero alloc, got %v", buf3)
	}

	// Free buffer should not panic
	a.Free(buf)

	// Free invalid buffer should be ignored
	a.Free(nil)
	a.Free([]byte{1, 2, 3})

	// Allocated bytes tracking
	if a.Allocated() != 100 {
		t.Errorf("expected allocated 100, got %d", a.Allocated())
	}

	a.Reset()
	if a.Allocated() != 0 {
		t.Errorf("expected allocated 0 after reset, got %d", a.Allocated())
	}
}

func TestLeanArenaRoleRestrictions(t *testing.T) {
	_, err := NewLeanArena(RoleFullArenaSpawn, 8.0)
	if err == nil {
		t.Fatal("expected error for disallowed role FULL_ARENA spawn")
	}

	_, err = NewLeanArena(RoleEngineer, 9.0)
	if err == nil {
		t.Fatal("expected error for monthly envelope > $8")
	}

	if !RoleAllowed(RoleEngineer) {
		t.Error("expected RoleEngineer to be allowed")
	}
	if !RoleAllowed(RoleReviewer) {
		t.Error("expected RoleReviewer to be allowed")
	}
	if RoleAllowed(RoleFullArenaSpawn) {
		t.Error("expected RoleFullArenaSpawn to be disallowed")
	}
}

func TestAvailableMicros(t *testing.T) {
	micros := AvailableMicros()
	if micros != 2_000_000 {
		t.Errorf("expected available micros 2,000,000, got %d", micros)
	}
}
