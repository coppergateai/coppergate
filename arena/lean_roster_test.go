package arena

import (
	"testing"
)

func TestLeanRosterBasic(t *testing.T) {
	r := NewLeanRoster()

	// Add supported roles
	if err := r.Add("alice", RoleEngineer); err != nil {
		t.Fatalf("unexpected error adding engineer: %v", err)
	}
	if err := r.Add("bob", RoleReviewer); err != nil {
		t.Fatalf("unexpected error adding reviewer: %v", err)
	}

	// Add unsupported role
	err := r.Add("charlie", RoleUnknown)
	if err != ErrRoleNotSupported {
		t.Fatalf("expected ErrRoleNotSupported, got %v", err)
	}

	// List should contain alice and bob
	roster := r.List()
	if len(roster) != 2 {
		t.Fatalf("expected 2 users, got %d", len(roster))
	}
	if role, ok := roster["alice"]; !ok || role != RoleEngineer {
		t.Errorf("alice missing or wrong role")
	}
	if role, ok := roster["bob"]; !ok || role != RoleReviewer {
		t.Errorf("bob missing or wrong role")
	}

	// Remove alice
	r.Remove("alice")
	roster = r.List()
	if _, ok := roster["alice"]; ok {
		t.Errorf("alice should have been removed")
	}
	if _, ok := roster["bob"]; !ok {
		t.Errorf("bob should still be present")
	}
}

func TestLeanRosterConcurrency(t *testing.T) {
	r := NewLeanRoster()
	done := make(chan struct{})
	const n = 1000

	// Concurrently add users
	go func() {
		for i := 0; i < n; i++ {
			_ = r.Add("user"+string(i), RoleEngineer)
		}
		close(done)
	}()

	// Concurrently remove users
	go func() {
		for i := 0; i < n; i++ {
			r.Remove("user" + string(i))
		}
	}()

	<-done
}
