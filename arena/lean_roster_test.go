package arena

import (
	"testing"
)

func TestLeanRoster_AddEntry(t *testing.T) {
	cfg := Config{MonthlyBudgetCents: 800} // $8.00 budget
	lr := NewLeanRoster(cfg)

	// Add Engineer under $2 cost - should succeed
	err := lr.AddEntry("user1", RoleEngineer, 150)
	if err != nil {
		t.Fatalf("unexpected error adding Engineer: %v", err)
	}

	// Add Reviewer under $2 cost - should succeed
	err = lr.AddEntry("user2", RoleReviewer, 199)
	if err != nil {
		t.Fatalf("unexpected error adding Reviewer: %v", err)
	}

	// Add FULL_ARENA role - should fail
	err = lr.AddEntry("user3", RoleFullArena, 100)
	if err == nil {
		t.Fatal("expected error adding FULL_ARENA role, got none")
	}

	// Add unknown role - should fail
	err = lr.AddEntry("user4", RoleUnknown, 100)
	if err == nil {
		t.Fatal("expected error adding unknown role, got none")
	}

	// Add Engineer exceeding budget - should fail
	err = lr.AddEntry("user5", RoleEngineer, 600)
	if err == nil {
		t.Fatal("expected budget exceeded error, got none")
	}

	// Check entries count
	entries := lr.Entries()
	if len(entries) != 2 {
		t.Fatalf("expected 2 entries, got %d", len(entries))
	}

	// Check spent cents
	spent := lr.Spent()
	if spent != 349 {
		t.Fatalf("expected spent 349 cents, got %d", spent)
	}
}
