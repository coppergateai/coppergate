package runtime

import (
	"testing"
	"time"
)

func TestReserveSuccess(t *testing.T) {
	mgr := NewSpendLicenseManager()
	license, err := mgr.Reserve(500, "")
	if err != nil {
		t.Fatalf("Reserve failed: %v", err)
	}
	if license.Amount != 500 {
		t.Errorf("Expected amount 500, got %d", license.Amount)
	}
	if !license.Reserved {
		t.Errorf("Expected license to be reserved")
	}
	if license.Accepted {
		t.Errorf("Expected license not accepted initially")
	}
}

func TestReserveExceedEnvelope(t *testing.T) {
	mgr := NewSpendLicenseManager()
	_, err := mgr.Reserve(MonthlyEnvelopeCents+1, "")
	if err == nil {
		t.Fatalf("Expected error when reserving more than envelope")
	}
}

func TestFanOutSuccess(t *testing.T) {
	mgr := NewSpendLicenseManager()
	parent, err := mgr.Reserve(600, "")
	if err != nil {
		t.Fatalf("Reserve failed: %v", err)
	}

	children, err := mgr.FanOut(parent.ID, []int{200, 300})
	if err != nil {
		t.Fatalf("FanOut failed: %v", err)
	}
	if len(children) != 2 {
		t.Errorf("Expected 2 children, got %d", len(children))
	}
	sum := 0
	for _, c := range children {
		sum += c.Amount
	}
	if sum != 500 {
		t.Errorf("Expected children sum 500, got %d", sum)
	}
	if parent.Amount != 100 {
		t.Errorf("Expected parent amount 100 after fan-out, got %d", parent.Amount)
	}
}

func TestFanOutExceedParent(t *testing.T) {
	mgr := NewSpendLicenseManager()
	parent, err := mgr.Reserve(400, "")
	if err != nil {
		t.Fatalf("Reserve failed: %v", err)
	}

	_, err = mgr.FanOut(parent.ID, []int{300, 200})
	if err == nil {
		t.Fatalf("Expected error when fan-out exceeds parent amount")
	}
}

func TestAcceptSuccess(t *testing.T) {
	mgr := NewSpendLicenseManager()
	license, err := mgr.Reserve(300, "")
	if err != nil {
		t.Fatalf("Reserve failed: %v", err)
	}

	receipt, err := mgr.Accept(license.ID)
	if err != nil {
		t.Fatalf("Accept failed: %v", err)
	}
	if receipt.LicenseID != license.ID {
		t.Errorf("Receipt LicenseID mismatch")
	}
	if receipt.Amount != license.Amount {
		t.Errorf("Receipt amount mismatch")
	}
	if receipt.Timestamp.Before(time.Now().Add(-time.Minute)) {
		t.Errorf("Receipt timestamp too old")
	}

	// Accepting again should fail
	_, err = mgr.Accept(license.ID)
	if err == nil {
		t.Fatalf("Expected error on double accept")
	}
}

func TestAcceptNonexistent(t *testing.T) {
	mgr := NewSpendLicenseManager()
	_, err := mgr.Accept("nonexistent")
	if err == nil {
		t.Fatalf("Expected error accepting nonexistent license")
	}
}
