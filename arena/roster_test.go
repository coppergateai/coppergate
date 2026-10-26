package arena

import (
	"testing"
)

func TestRosterAddUser(t *testing.T) {
	roster := NewRoster(8) // $8 monthly envelope = 8 micros

	// Add engineer user
	err := roster.AddUser("user1", RoleEngineer)
	if err != nil {
		t.Fatalf("unexpected error adding engineer: %v", err)
	}

	// Add reviewer user
	err = roster.AddUser("user2", RoleReviewer)
	if err != nil {
		t.Fatalf("unexpected error adding reviewer: %v", err)
	}

	// Add other role user - should be ignored silently (no error, no add)
	err = roster.AddUser("user3", RoleOther)
	if err != nil {
		t.Fatalf("unexpected error adding other role: %v", err)
	}
	users := roster.Users()
	if _, ok := users["user3"]; ok {
		t.Errorf("user with other role should not be added")
	}

	// Add duplicate user - no additional cost
	err = roster.AddUser("user1", RoleEngineer)
	if err != nil {
		t.Fatalf("unexpected error adding duplicate user: %v", err)
	}

	// Add users until budget exceeded
	err = roster.AddUser("user4", RoleEngineer)
	if err != nil {
		t.Fatalf("unexpected error adding user4: %v", err)
	}
	// Micros used now: 2+2+2 = 6

	err = roster.AddUser("user5", RoleReviewer)
	if err != ErrBudgetExceeded {
		t.Errorf("expected ErrBudgetExceeded adding user5, got %v", err)
	}

	// Remove a user and add another
	roster.RemoveUser("user2") // frees 2 micros, used now 4
	err = roster.AddUser("user5", RoleReviewer)
	if err != nil {
		t.Fatalf("unexpected error adding user5 after removal: %v", err)
	}

	// Check micros used is 6 again
	if got := roster.MicrosUsed(); got != 6 {
		t.Errorf("expected micros used 6, got %d", got)
	}
}

func TestRosterRemoveUser(t *testing.T) {
	roster := NewRoster(8)
	roster.AddUser("user1", RoleEngineer)
	roster.AddUser("user2", RoleReviewer)

	roster.RemoveUser("user1")
	users := roster.Users()
	if _, ok := users["user1"]; ok {
		t.Errorf("user1 should have been removed")
	}

	// Removing non-existent user should not panic
	roster.RemoveUser("nonexistent")
}

func TestRosterMicrosLimit(t *testing.T) {
	const limit = 8
	roster := NewRoster(limit)
	if roster.MicrosLimit() != limit {
		t.Errorf("expected micros limit %d, got %d", limit, roster.MicrosLimit())
	}
}
