package programruntime

import (
	"testing"
)

func TestReserveLicenseSuccess(t *testing.T) {
	lm := NewLicenseManager()
	programID := "prog1"

	badge, err := lm.ReserveLicense(programID, 5)
	if err != nil {
		t.Fatalf("ReserveLicense failed: %v", err)
	}
	if badge.ProgramID != programID {
		t.Errorf("Badge ProgramID mismatch: got %s, want %s", badge.ProgramID, programID)
	}
	balance := lm.GetBalance(programID)
	expectedBalance := MonthlySpendEnvelope - 5
	if balance != expectedBalance {
		t.Errorf("Balance mismatch: got %.2f, want %.2f", balance, expectedBalance)
	}
}

func TestReserveLicenseInsufficientBalance(t *testing.T) {
	lm := NewLicenseManager()
	programID := "prog2"

	_, err := lm.ReserveLicense(programID, 9)
	if err == nil {
		t.Fatal("Expected error for amount exceeding monthly envelope")
	}
}

func TestValidateBadge(t *testing.T) {
	lm := NewLicenseManager()
	programID := "prog3"

	badge, err := lm.ReserveLicense(programID, 3)
	if err != nil {
		t.Fatalf("ReserveLicense failed: %v", err)
	}

	valid := lm.ValidateBadge(badge.ID, programID)
	if !valid {
		t.Error("Expected badge to be valid")
	}

	invalid := lm.ValidateBadge("nonexistent", programID)
	if invalid {
		t.Error("Expected nonexistent badge to be invalid")
	}
}

func TestAcceptLicenseSuccess(t *testing.T) {
	lm := NewLicenseManager()
	programID := "prog4"

	badge, err := lm.ReserveLicense(programID, 4)
	if err != nil {
		t.Fatalf("ReserveLicense failed: %v", err)
	}

	receipt, err := lm.AcceptLicense(badge.ID, 4)
	if err != nil {
		t.Fatalf("AcceptLicense failed: %v", err)
	}
	if receipt.ProgramID != programID {
		t.Errorf("Receipt ProgramID mismatch: got %s, want %s", receipt.ProgramID, programID)
	}

	// Badge should be invalid after acceptance
	valid := lm.ValidateBadge(badge.ID, programID)
	if valid {
		t.Error("Expected badge to be invalid after acceptance")
	}
}

func TestAcceptLicenseInvalidBadge(t *testing.T) {
	lm := NewLicenseManager()

	_, err := lm.AcceptLicense("invalid-badge", 1)
	if err == nil {
		t.Fatal("Expected error for invalid badge")
	}
}

func TestGetReceipts(t *testing.T) {
	lm := NewLicenseManager()
	programID := "prog5"

	badge, err := lm.ReserveLicense(programID, 2)
	if err != nil {
		t.Fatalf("ReserveLicense failed: %v", err)
	}

	_, err = lm.AcceptLicense(badge.ID, 2)
	if err != nil {
		t.Fatalf("AcceptLicense failed: %v", err)
	}

	receipts := lm.GetReceipts()
	if len(receipts) != 1 {
		t.Errorf("Expected 1 receipt, got %d", len(receipts))
	}
}
