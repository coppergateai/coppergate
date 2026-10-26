package programruntime

import (
	"testing"
	"time"
)

func TestSpendLicense_Reserve(t *testing.T) {
	sl := NewSpendLicense("license1", 8.0)

	err := sl.Reserve(5.0)
	if err != nil {
		t.Fatalf("unexpected error reserving 5.0: %v", err)
	}

	if sl.Reserved != 5.0 {
		t.Errorf("expected reserved 5.0, got %.2f", sl.Reserved)
	}

	err = sl.Reserve(4.0)
	if err == nil {
		t.Errorf("expected error reserving 4.0 exceeding budget, got none")
	}
}

func TestSpendLicense_FanOut(t *testing.T) {
	sl := NewSpendLicense("license1", 8.0)
	err := sl.Reserve(6.0)
	if err != nil {
		t.Fatalf("reserve failed: %v", err)
	}

	newLicense, err := sl.FanOut(3.0, "license2")
	if err != nil {
		t.Fatalf("fanout failed: %v", err)
	}

	if newLicense.TotalBudget != 3.0 {
		t.Errorf("expected new license budget 3.0, got %.2f", newLicense.TotalBudget)
	}

	if sl.Reserved != 3.0 {
		t.Errorf("expected original reserved reduced to 3.0, got %.2f", sl.Reserved)
	}

	_, err = sl.FanOut(4.0, "license3")
	if err == nil {
		t.Errorf("expected error fanout exceeding reserved budget, got none")
	}
}

func TestSpendLicense_IssueBadge(t *testing.T) {
	sl := NewSpendLicense("license1", 8.0)

	badge, err := sl.IssueBadge("badge1", "Alice", time.Hour*24)
	if err != nil {
		t.Fatalf("issue badge failed: %v", err)
	}

	if badge.BadgeID != "badge1" || badge.HolderName != "Alice" {
		t.Errorf("badge fields mismatch")
	}

	_, err = sl.IssueBadge("badge1", "Bob", time.Hour*24)
	if err == nil {
		t.Errorf("expected error issuing duplicate badgeID, got none")
	}
}

func TestSpendLicense_AcceptReservation(t *testing.T) {
	sl := NewSpendLicense("license1", 8.0)
	err := sl.Reserve(7.0)
	if err != nil {
		t.Fatalf("reserve failed: %v", err)
	}

	receipt, err := sl.AcceptReservation(5.0, "receipt1", "Test acceptance")
	if err != nil {
		t.Fatalf("accept reservation failed: %v", err)
	}

	if receipt.Amount != 5.0 || receipt.ReceiptID != "receipt1" {
		t.Errorf("receipt fields mismatch")
	}

	if sl.Reserved != 2.0 {
		t.Errorf("expected reserved 2.0 after acceptance, got %.2f", sl.Reserved)
	}

	_, err = sl.AcceptReservation(3.0, "receipt2", "Over acceptance")
	if err == nil {
		t.Errorf("expected error accepting more than reserved, got none")
	}
}
