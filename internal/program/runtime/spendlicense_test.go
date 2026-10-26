package runtime

import (
	"testing"
	"time"
)

func TestReserveSpendLicense(t *testing.T) {
	mgr := NewSpendLicenseManager(8)

	id, err := mgr.ReserveSpendLicense(3)
	if err != nil {
		t.Fatalf("ReserveSpendLicense failed: %v", err)
	}
	if id == "" {
		t.Fatal("ReserveSpendLicense returned empty LicenseID")
	}

	// Reserve more than available envelope
	_, err = mgr.ReserveSpendLicense(6)
	if err == nil {
		t.Fatal("expected error when reserving more than envelope")
	}
}

func TestFanOutLicense(t *testing.T) {
	mgr := NewSpendLicenseManager(8)

	parentID, err := mgr.ReserveSpendLicense(5)
	if err != nil {
		t.Fatalf("ReserveSpendLicense failed: %v", err)
	}

	childID, err := mgr.FanOutLicense(parentID, 3)
	if err != nil {
		t.Fatalf("FanOutLicense failed: %v", err)
	}

	if childID == "" {
		t.Fatal("FanOutLicense returned empty LicenseID")
	}

	// Fan out more than parent amount
	_, err = mgr.FanOutLicense(parentID, 3)
	if err == nil {
		t.Fatal("expected error when fan-out exceeds parent amount")
	}

	// Accept parent license and try to fan out again
	_, err = mgr.AcceptLicense(parentID)
	if err != nil {
		t.Fatalf("AcceptLicense failed: %v", err)
	}

	_, err = mgr.FanOutLicense(parentID, 1)
	if err == nil {
		t.Fatal("expected error when fan-out from accepted license")
	}
}

func TestAcceptLicense(t *testing.T) {
	mgr := NewSpendLicenseManager(8)

	id, err := mgr.ReserveSpendLicense(4)
	if err != nil {
		t.Fatalf("ReserveSpendLicense failed: %v", err)
	}

	receipt, err := mgr.AcceptLicense(id)
	if err != nil {
		t.Fatalf("AcceptLicense failed: %v", err)
	}

	if receipt.LicenseID != id {
		t.Errorf("ShipReceipt LicenseID mismatch: got %s, want %s", receipt.LicenseID, id)
	}

	if receipt.Amount != 4 {
		t.Errorf("ShipReceipt Amount mismatch: got %d, want %d", receipt.Amount, 4)
	}

	if time.Since(receipt.Timestamp) > time.Minute {
		t.Error("ShipReceipt Timestamp is too old")
	}

	// Accept again should fail
	_, err = mgr.AcceptLicense(id)
	if err == nil {
		t.Fatal("expected error on accepting license twice")
	}
}

func TestBadge(t *testing.T) {
	mgr := NewSpendLicenseManager(8)

	id, err := mgr.ReserveSpendLicense(2)
	if err != nil {
		t.Fatalf("ReserveSpendLicense failed: %v", err)
	}

	badge, err := mgr.Badge(id)
	if err != nil {
		t.Fatalf("Badge failed: %v", err)
	}

	if badge == "" {
		t.Error("Badge returned empty string")
	}

	// Badge for unknown license
	_, err = mgr.Badge("unknown")
	if err == nil {
		t.Fatal("expected error for unknown license badge")
	}
}
