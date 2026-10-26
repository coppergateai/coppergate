package arena

import (
	"testing"
)

func TestRoster_AddEntry_UnderBudget(t *testing.T) {
	r := NewRoster(1_500_000) // $1.5 budget under $2

	// Engineer allowed
	if err := r.AddEntry("user1", RoleEngineer); err != nil {
		t.Fatalf("expected engineer allowed, got error: %v", err)
	}

	// Reviewer allowed
	if err := r.AddEntry("user2", RoleReviewer); err != nil {
		t.Fatalf("expected reviewer allowed, got error: %v", err)
	}

	// FullArena disallowed
	if err := r.AddEntry("user3", RoleFullArena); err != ErrFullArenaNotAllowed {
		t.Fatalf("expected FULL_ARENA disallowed, got: %v", err)
	}

	// Unknown role disallowed
	if err := r.AddEntry("user4", Role(99)); err == nil {
		t.Fatalf("expected unknown role disallowed, got nil error")
	}
}

func TestRoster_AddEntry_AboveBudget(t *testing.T) {
	r := NewRoster(3_000_000) // $3 budget above $2

	// Engineer allowed
	if err := r.AddEntry("user1", RoleEngineer); err != nil {
		t.Fatalf("expected engineer allowed, got error: %v", err)
	}

	// Reviewer allowed
	if err := r.AddEntry("user2", RoleReviewer); err != nil {
		t.Fatalf("expected reviewer allowed, got error: %v", err)
	}

	// FullArena allowed above budget
	if err := r.AddEntry("user3", RoleFullArena); err != nil {
		t.Fatalf("expected FULL_ARENA allowed, got error: %v", err)
	}
}

func TestRoster_SetAvailableMicros(t *testing.T) {
	r := NewRoster(3_000_000)
	if err := r.AddEntry("user1", RoleFullArena); err != nil {
		t.Fatalf("expected FULL_ARENA allowed initially, got error: %v", err)
	}

	r.SetAvailableMicros(1_000_000) // reduce budget below $2

	// Now FULL_ARENA disallowed
	if err := r.AddEntry("user2", RoleFullArena); err != ErrFullArenaNotAllowed {
		t.Fatalf("expected FULL_ARENA disallowed after budget drop, got: %v", err)
	}
}
