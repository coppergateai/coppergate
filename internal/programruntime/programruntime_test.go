package programruntime

import (
	"testing"
	"time"
)

func TestReserveSpendLicense(t *testing.T) {
	pr := New()

	// Reserve $5.00 (500 cents) - should succeed
	if err := pr.ReserveSpendLicense(500); err != nil {
		t.Fatalf("unexpected error reserving spend: %v", err)
	}

	// Reserve $4.00 (400 cents) - should fail (total 900 > 800)
	if err := pr.ReserveSpendLicense(400); err != ErrSpendLimitExceeded {
		t.Fatalf("expected ErrSpendLimitExceeded, got %v", err)
	}

	// Reserve $3.00 (300 cents) - should succeed (total 800)
	if err := pr.ReserveSpendLicense(300); err != nil {
		t.Fatalf("unexpected error reserving spend: %v", err)
	}
}

func TestResetIfNeeded(t *testing.T) {
	pr := New()
	pr.spendReserved = 800
	pr.lastReset = time.Now().Add(-31 * 24 * time.Hour) // force reset

	pr.resetIfNeeded()

	if pr.spendReserved != 0 {
		t.Fatalf("expected spendReserved reset to 0, got %d", pr.spendReserved)
	}
}

func TestIssueAndGetIDBadge(t *testing.T) {
	pr := New()
	badgeID := "badge123"

	badge := pr.IssueIDBadge(badgeID)
	if badge.ID != badgeID {
		t.Fatalf("expected badge ID %s, got %s", badgeID, badge.ID)
	}

	gotBadge, err := pr.GetIDBadge(badgeID)
	if err != nil {
		t.Fatalf("unexpected error getting badge: %v", err)
	}
	if gotBadge.ID != badgeID {
		t.Fatalf("expected badge ID %s, got %s", badgeID, gotBadge.ID)
	}

	// Test non-existent badge
	_, err = pr.GetIDBadge("nonexistent")
	if err != ErrBadgeNotFound {
		t.Fatalf("expected ErrBadgeNotFound, got %v", err)
	}
}

func TestAcceptAndShip(t *testing.T) {
	pr := New()
	programID := "prog1"
	details := "Accepted program state"

	receipt := pr.AcceptAndShip(programID, details)
	if receipt.ProgramID != programID {
		t.Fatalf("expected ProgramID %s, got %s", programID, receipt.ProgramID)
	}
	if receipt.Details != details {
		t.Fatalf("expected Details %s, got %s", details, receipt.Details)
	}
	if time.Since(receipt.Timestamp) > time.Minute {
		t.Fatalf("receipt timestamp too old")
	}
}
