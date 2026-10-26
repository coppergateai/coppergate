package runtime

import (
	"testing"
)

func TestSpendLicenseReserveAndAcceptUsage(t *testing.T) {
	sl := NewSpendLicense(800) // $8.00 = 800 cents

	// Reserve 300 cents
	if err := sl.Reserve(300); err != nil {
		t.Fatalf("Reserve failed: %v", err)
	}

	// Reserve more than available should fail
	if err := sl.Reserve(600); err == nil {
		t.Fatalf("Reserve should have failed due to insufficient funds")
	}

	// Issue badge
	badge, err := sl.IssueIDBadge("badge1")
	if err != nil {
		t.Fatalf("IssueIDBadge failed: %v", err)
	}
	if badge.ID != "badge1" {
		t.Fatalf("Badge ID mismatch")
	}

	// Accept usage more than reserved should fail
	if _, err := sl.AcceptUsage("badge1", 400); err == nil {
		t.Fatalf("AcceptUsage should have failed due to usage > reserved")
	}

	// Accept valid usage
	receipt, err := sl.AcceptUsage("badge1", 200)
	if err != nil {
		t.Fatalf("AcceptUsage failed: %v", err)
	}
	if receipt.AmountCents != 200 {
		t.Fatalf("Receipt amount mismatch")
	}

	// Reserved should be 100 now
	if sl.ReservedCents != 100 {
		t.Fatalf("ReservedCents expected 100, got %d", sl.ReservedCents)
	}

	// Consumed should be 200 now
	if sl.ConsumedCents != 200 {
		t.Fatalf("ConsumedCents expected 200, got %d", sl.ConsumedCents)
	}

	// Accept usage on revoked badge should fail
	if err := sl.RevokeBadge("badge1"); err != nil {
		t.Fatalf("RevokeBadge failed: %v", err)
	}
	if _, err := sl.AcceptUsage("badge1", 50); err == nil {
		t.Fatalf("AcceptUsage should have failed on revoked badge")
	}
}

func TestLandUsage(t *testing.T) {
	sl := NewSpendLicense(800)

	// Issue badge
	badge, err := sl.IssueIDBadge("badge2")
	if err != nil {
		t.Fatalf("IssueIDBadge failed: %v", err)
	}

	// Land usage
	data := LandingData{
		BadgeID:     badge.ID,
		AmountCents: 150,
	}
	if err := sl.LandUsage(data); err != nil {
		t.Fatalf("LandUsage failed: %v", err)
	}

	if sl.ConsumedCents != 150 {
		t.Fatalf("ConsumedCents expected 150, got %d", sl.ConsumedCents)
	}
	if badge.Consumed != 150 {
		t.Fatalf("Badge consumed expected 150, got %d", badge.Consumed)
	}
}

func TestIssueIDBadgeDuplicate(t *testing.T) {
	sl := NewSpendLicense(800)
	_, err := sl.IssueIDBadge("badge3")
	if err != nil {
		t.Fatalf("IssueIDBadge failed: %v", err)
	}
	_, err = sl.IssueIDBadge("badge3")
	if err == nil {
		t.Fatalf("IssueIDBadge should have failed on duplicate badge ID")
	}
}

func TestReserveInvalidAmount(t *testing.T) {
	sl := NewSpendLicense(800)
	if err := sl.Reserve(0); err == nil {
		t.Fatalf("Reserve should fail on zero amount")
	}
	if err := sl.Reserve(-10); err == nil {
		t.Fatalf("Reserve should fail on negative amount")
	}
}

func TestAcceptUsageInvalidAmount(t *testing.T) {
	sl := NewSpendLicense(800)
	if err := sl.Reserve(100); err != nil {
		t.Fatalf("Reserve failed: %v", err)
	}
	_, err := sl.IssueIDBadge("badge4")
	if err != nil {
		t.Fatalf("IssueIDBadge failed: %v", err)
	}
	_, err = sl.AcceptUsage("badge4", 0)
	if err == nil {
		t.Fatalf("AcceptUsage should fail on zero amount")
	}
	_, err = sl.AcceptUsage("badge4", -5)
	if err == nil {
		t.Fatalf("AcceptUsage should fail on negative amount")
	}
}

func TestRevokeBadgeNotFound(t *testing.T) {
	sl := NewSpendLicense(800)
	err := sl.RevokeBadge("nonexistent")
	if err == nil {
		t.Fatalf("RevokeBadge should fail on nonexistent badge")
	}
}
