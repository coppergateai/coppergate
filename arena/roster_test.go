package arena

import (
	"testing"
)

func TestLeanRoster_AddMember(t *testing.T) {
	r := NewLeanRoster()

	// Add engineer under budget
	if err := r.AddMember("eng1", RoleEngineer); err != nil {
		t.Fatalf("unexpected error adding engineer: %v", err)
	}

	// Add reviewer under budget
	if err := r.AddMember("rev1", RoleReviewer); err != nil {
		t.Fatalf("unexpected error adding reviewer: %v", err)
	}

	// Add FULL_ARENA disallowed
	if err := r.AddMember("full1", RoleFullArena); err == nil {
		t.Fatalf("expected error adding FULL_ARENA member, got none")
	}

	// Fill budget with engineers
	for i := 2; i <= 4; i++ {
		id := "eng" + string('0'+i)
		err := r.AddMember(id, RoleEngineer)
		if err != nil && err != ErrBudgetExceeded {
			t.Fatalf("unexpected error adding engineer %s: %v", id, err)
		}
	}

	// Try to add one more engineer, expect budget exceeded
	err := r.AddMember("engX", RoleEngineer)
	if err != ErrBudgetExceeded {
		t.Fatalf("expected ErrBudgetExceeded, got %v", err)
	}

	// Remove a member and add another
	r.RemoveMember("eng1")
	if err := r.AddMember("engNew", RoleEngineer); err != nil {
		t.Fatalf("unexpected error adding engineer after removal: %v", err)
	}
}

func TestLeanRoster_Members(t *testing.T) {
	r := NewLeanRoster()
	r.AddMember("eng1", RoleEngineer)
	r.AddMember("rev1", RoleReviewer)

	members := r.Members()
	if len(members) != 2 {
		t.Fatalf("expected 2 members, got %d", len(members))
	}

	foundEng := false
	foundRev := false
	for _, m := range members {
		switch m.Role {
		case RoleEngineer:
			foundEng = true
		case RoleReviewer:
			foundRev = true
		default:
			t.Fatalf("unexpected role in members: %v", m.Role)
		}
	}
	if !foundEng || !foundRev {
		t.Fatalf("expected both engineer and reviewer in members")
	}
}
