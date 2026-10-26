package arena

import (
	"testing"
)

func TestRosterAddRemove(t *testing.T) {
	r := NewRoster()
	u1 := User{ID: "u1", Role: RoleEngineer}
	u2 := User{ID: "u2", Role: RoleReviewer}
	r.AddUser(u1)
	r.AddUser(u2)
	if r.Count() != 2 {
		t.Fatalf("expected 2 users, got %d", r.Count())
	}
	if !r.HasEngineerAndReviewer() {
		t.Fatal("expected roster to have engineer and reviewer")
	}
	r.RemoveUser("u1")
	if r.Count() != 1 {
		t.Fatalf("expected 1 user, got %d", r.Count())
	}
	if r.HasEngineerAndReviewer() {
		t.Fatal("expected roster to NOT have engineer and reviewer after removal")
	}
}

func TestArenaSpawnFullArena(t *testing.T) {
	a := NewArena(3000)
	err := a.SpawnFullArena()
	if err != nil {
		t.Fatalf("expected full arena spawn success, got error: %v", err)
	}
	err = a.SpawnFullArena()
	if err != nil {
		t.Fatalf("expected no error on repeated spawn, got: %v", err)
	}

	a.SetAvailableMicros(1000)
	a2 := NewArena(1000)
	err = a2.SpawnFullArena()
	if err != ErrBudgetExceeded {
		t.Fatalf("expected ErrBudgetExceeded for low budget, got: %v", err)
	}
}

func TestArenaSpawnLeanRoster(t *testing.T) {
	a := NewArena(1500)
	// No users yet
	err := a.SpawnLeanRoster()
	if err == nil {
		t.Fatal("expected error for lean roster without engineer+reviewer")
	}
	// Add only engineer
	a.AddUserToRoster(User{ID: "eng1", Role: RoleEngineer})
	err = a.SpawnLeanRoster()
	if err == nil {
		t.Fatal("expected error for lean roster without reviewer")
	}
	// Add reviewer
	a.AddUserToRoster(User{ID: "rev1", Role: RoleReviewer})
	err = a.SpawnLeanRoster()
	if err != nil {
		t.Fatalf("expected lean roster spawn success, got error: %v", err)
	}
}

func TestArenaSpawnArena(t *testing.T) {
	a := NewArena(3000)
	a.AddUserToRoster(User{ID: "eng1", Role: RoleEngineer})
	a.AddUserToRoster(User{ID: "rev1", Role: RoleReviewer})
	err := a.SpawnArena()
	if err != nil {
		t.Fatalf("expected full arena spawn success, got error: %v", err)
	}

	a2 := NewArena(1500)
	a2.AddUserToRoster(User{ID: "eng1", Role: RoleEngineer})
	a2.AddUserToRoster(User{ID: "rev1", Role: RoleReviewer})
	err = a2.SpawnArena()
	if err != nil {
		t.Fatalf("expected lean roster spawn success, got error: %v", err)
	}

	a3 := NewArena(1500)
	err = a3.SpawnArena()
	if err == nil {
		t.Fatal("expected error for lean roster spawn without engineer+reviewer")
	}
}
