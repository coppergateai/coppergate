package runtime

import (
	"testing"
)

func TestReserveLicense(t *testing.T) {
	lm := NewLicenseManager()
	license, err := lm.ReserveLicense("prog1", 5.0)
	if err != nil {
		t.Fatalf("ReserveLicense failed: %v", err)
	}
	if license.Amount != 5.0 {
		t.Errorf("Expected amount 5.0, got %v", license.Amount)
	}
	if license.ProgramID != "prog1" {
		t.Errorf("Expected programID prog1, got %v", license.ProgramID)
	}
	if license.BadgeID == "" {
		t.Error("Expected non-empty BadgeID")
	}
}

func TestFanOutLicense(t *testing.T) {
	lm := NewLicenseManager()
	license, _ := lm.ReserveLicense("prog1", 10.0)

	err := lm.FanOutLicense(license.ID, 4.0)
	if err != nil {
		t.Fatalf("FanOutLicense failed: %v", err)
	}
	license2, _ := lm.GetLicense(license.ID)
	if license2.Consumed != 4.0 {
		t.Errorf("Expected consumed 4.0, got %v", license2.Consumed)
	}

	// Fan-out exceeding amount
	err = lm.FanOutLicense(license.ID, 7.0)
	if err == nil {
		t.Error("Expected error on fan-out exceeding reserved amount")
	}
}

func TestAcceptLicense(t *testing.T) {
	lm := NewLicenseManager()
	license, _ := lm.ReserveLicense("prog1", 3.0)

	receipt, err := lm.AcceptLicense(license.ID)
	if err != nil {
		t.Fatalf("AcceptLicense failed: %v", err)
	}
	if receipt == "" {
		t.Error("Expected non-empty receipt ID")
	}

	// Accept again should fail
	_, err = lm.AcceptLicense(license.ID)
	if err == nil {
		t.Error("Expected error on accepting already accepted license")
	}
}

func TestFanOutAfterAccept(t *testing.T) {
	lm := NewLicenseManager()
	license, _ := lm.ReserveLicense("prog1", 5.0)

	_, _ = lm.AcceptLicense(license.ID)
	err := lm.FanOutLicense(license.ID, 1.0)
	if err == nil {
		t.Error("Expected error on fan-out after acceptance")
	}
}
