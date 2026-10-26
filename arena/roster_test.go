package arena

import (
	"testing"
)

func TestLeanRoster_AddUser_UnderBudget(t *testing.T) {
	r := NewRoster(1_500_000) // $1.5 budget under $2

	// Engineer allowed
	if err := r.AddUser(User{ID: "u1", Role: RoleEngineer}); err != nil {
		t.Fatalf("expected engineer allowed, got error: %v", err)
	}

	// Reviewer allowed
	if err := r.AddUser(User{ID: "u2", Role: RoleReviewer}); err != nil {
		t.Fatalf("expected reviewer allowed, got error: %v", err)
	}

	// FullArena disallowed
	err := r.AddUser(User{ID: "u3", Role: RoleFullArena})
	if err == nil {
		t.Fatal("expected error adding FullArena under budget < $2, got none")
	}

	// Other roles disallowed (simulate by casting invalid role)
	err = r.AddUser(User{ID: "u4", Role: Role(99)})
	if err == nil {
		t.Fatal("expected error adding unknown role under budget < $2, got none")
	}
}

func TestLeanRoster_AddUser_AboveBudget(t *testing.T) {
	r := NewRoster(3_000_000) // $3 budget above $2

	// Engineer allowed
	if err := r.AddUser(User{ID: "u1", Role: RoleEngineer}); err != nil {
		t.Fatalf("expected engineer allowed, got error: %v", err)
	}

	// Reviewer allowed
	if err := r.AddUser(User{ID: "u2", Role: RoleReviewer}); err != nil {
		t.Fatalf("expected reviewer allowed, got error: %v", err)
	}

	// FullArena allowed
	if err := r.AddUser(User{ID: "u3", Role: RoleFullArena}); err != nil {
		t.Fatalf("expected FullArena allowed above $2, got error: %v", err)
	}
}

func TestLeanRoster_SpawnArena(t *testing.T) {
	r := NewRoster(1_000_000) // $1 budget under $2

	err := r.SpawnArena()
	if err == nil {
		t.Fatal("expected error spawning FULL_ARENA under budget < $2, got none")
	}

	r.SetAvailableMicros(3_000_000) // $3 budget above $2

	err = r.SpawnArena()
	if err != nil {
		t.Fatalf("expected spawn success above $2, got error: %v", err)
	}
}
