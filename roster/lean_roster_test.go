package roster

import (
	"testing"
)

func TestLeanRoster_AddMember(t *testing.T) {
	lr := NewLeanRoster()

	// Valid member under $2, Engineer role, LEAN_ARENA spawn
	m1 := Member{
		ID:        "m1",
		Role:      RoleEngineer,
		MicroCost: 1_500_000,
		Spawn:     SpawnLeanArena,
	}
	if err := lr.AddMember(m1); err != nil {
		t.Fatalf("expected add member success, got error: %v", err)
	}

	// Member exceeding $2 micro cost
	m2 := Member{
		ID:        "m2",
		Role:      RoleEngineer,
		MicroCost: 2_500_000,
		Spawn:     SpawnLeanArena,
	}
	if err := lr.AddMember(m2); err == nil {
		t.Fatal("expected error for member micro cost exceeding $2, got nil")
	}

	// Member with role not Engineer or Reviewer
	m3 := Member{
		ID:        "m3",
		Role:      "Intern",
		MicroCost: 1_000_000,
		Spawn:     SpawnLeanArena,
	}
	if err := lr.AddMember(m3); err == nil {
		t.Fatal("expected error for invalid role, got nil")
	}

	// Member with FULL_ARENA spawn
	m4 := Member{
		ID:        "m4",
		Role:      RoleReviewer,
		MicroCost: 1_000_000,
		Spawn:     SpawnFullArena,
	}
	if err := lr.AddMember(m4); err == nil {
		t.Fatal("expected error for FULL_ARENA spawn under tight budget, got nil")
	}

	// Add members until budget exceeded
	for i := 0; i < 5; i++ {
		m := Member{
			ID:        "m" + string('5'+i),
			Role:      RoleEngineer,
			MicroCost: 1_500_000,
			Spawn:     SpawnLeanArena,
		}
		err := lr.AddMember(m)
		if i < 4 && err != nil {
			t.Fatalf("expected success adding member %d, got error: %v", i, err)
		}
		if i == 4 && err == nil {
			t.Fatal("expected error adding member exceeding budget, got nil")
		}
	}
}

func TestLeanRoster_Members(t *testing.T) {
	lr := NewLeanRoster()
	m1 := Member{
		ID:        "m1",
		Role:      RoleEngineer,
		MicroCost: 1_000_000,
		Spawn:     SpawnLeanArena,
	}
	_ = lr.AddMember(m1)

	members := lr.Members()
	if len(members) != 1 {
		t.Fatalf("expected 1 member, got %d", len(members))
	}
	if members[0].ID != "m1" {
		t.Fatalf("expected member ID m1, got %s", members[0].ID)
	}
}
