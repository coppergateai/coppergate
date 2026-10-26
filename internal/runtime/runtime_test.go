package runtime

import (
	"testing"
	"time"
)

func TestSpendLicenseReserveUseRelease(t *testing.T) {
	manager := NewSpendLicenseManager(800) // $8.00 in cents

	err := manager.Reserve("res1", 300)
	if err != nil {
		t.Fatalf("Reserve failed: %v", err)
	}

	err = manager.Reserve("res2", 600)
	if err == nil {
		t.Fatalf("Reserve should have failed due to budget exceeded")
	}

	err = manager.Use("res1")
	if err != nil {
		t.Fatalf("Use failed: %v", err)
	}

	err = manager.Use("res1")
	if err == nil {
		t.Fatalf("Use should have failed for already used reservation")
	}

	err = manager.Release("res1")
	if err != nil {
		t.Fatalf("Release failed: %v", err)
	}

	err = manager.Release("res1")
	if err == nil {
		t.Fatalf("Release should have failed for non-existent reservation")
	}
}

func TestIDBadgeIssueValidateInvalidate(t *testing.T) {
	manager := NewIDBadgeManager()

	badge, err := manager.IssueBadge(100 * time.Millisecond)
	if err != nil {
		t.Fatalf("IssueBadge failed: %v", err)
	}

	valid, err := manager.ValidateBadge(badge.ID)
	if err != nil || !valid {
		t.Fatalf("ValidateBadge failed: %v", err)
	}

	time.Sleep(150 * time.Millisecond)
	valid, err = manager.ValidateBadge(badge.ID)
	if err == nil || valid {
		t.Fatalf("ValidateBadge should have failed due to expiration")
	}

	badge2, err := manager.IssueBadge(time.Minute)
	if err != nil {
		t.Fatalf("IssueBadge failed: %v", err)
	}

	err = manager.InvalidateBadge(badge2.ID)
	if err != nil {
		t.Fatalf("InvalidateBadge failed: %v", err)
	}

	valid, err = manager.ValidateBadge(badge2.ID)
	if err == nil || valid {
		t.Fatalf("ValidateBadge should have failed due to invalidation")
	}
}

func TestShipReceiptIssueGet(t *testing.T) {
	manager := NewShipReceiptManager()

	receipt, err := manager.IssueReceipt("r1", "res1", "details")
	if err != nil {
		t.Fatalf("IssueReceipt failed: %v", err)
	}

	if receipt.ID != "r1" {
		t.Fatalf("Receipt ID mismatch")
	}

	_, err = manager.IssueReceipt("r1", "res2", "details")
	if err == nil {
		t.Fatalf("IssueReceipt should have failed for duplicate ID")
	}

	got, err := manager.GetReceipt("r1")
	if err != nil {
		t.Fatalf("GetReceipt failed: %v", err)
	}

	if got.ID != "r1" {
		t.Fatalf("GetReceipt ID mismatch")
	}

	_, err = manager.GetReceipt("nonexistent")
	if err == nil {
		t.Fatalf("GetReceipt should have failed for nonexistent ID")
	}
}

func TestRuntimeManagerFlow(t *testing.T) {
	rm := NewRuntimeManager(800) // $8.00 in cents

	// Reserve spend license
	err := rm.ReserveSpendLicense("res1", 500)
	if err != nil {
		t.Fatalf("ReserveSpendLicense failed: %v", err)
	}

	// Issue badge
	badge, err := rm.IssueIDBadge(time.Minute)
	if err != nil {
		t.Fatalf("IssueIDBadge failed: %v", err)
	}

	valid, err := rm.ValidateBadge(badge.ID)
	if err != nil || !valid {
		t.Fatalf("ValidateBadge failed: %v", err)
	}

	// Accept runtime execution
	receipt, err := rm.AcceptRuntimeExecution("res1", "receipt1", "runtime completed successfully")
	if err != nil {
		t.Fatalf("AcceptRuntimeExecution failed: %v", err)
	}

	if receipt.ID != "receipt1" {
		t.Fatalf("Receipt ID mismatch")
	}

	// Validate badge still valid
	valid, err = rm.ValidateBadge(badge.ID)
	if err != nil || !valid {
		t.Fatalf("ValidateBadge failed after accept: %v", err)
	}

	// Release spend license (should error because already used)
	err = rm.ReleaseSpendLicense("res1")
	if err == nil {
		t.Fatalf("ReleaseSpendLicense should have failed for used reservation")
	}
}
