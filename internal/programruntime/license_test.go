package programruntime

import (
	"testing"
	"time"
)

func TestReserveSpendLicense_Success(t *testing.T) {
	lm := NewLicenseManager()
	license, err := lm.ReserveSpendLicense(500)
	if err != nil {
		t.Fatalf("unexpected error reserving license: %v", err)
	}
	if license.AmountCents != 500 {
		t.Errorf("expected amount 500, got %d", license.AmountCents)
	}
	if license.IDBadge == "" {
		t.Error("expected non-empty ID badge")
	}
}

func TestReserveSpendLicense_ExceedEnvelope(t *testing.T) {
	lm := NewLicenseManager()
	_, err := lm.ReserveSpendLicense(700)
	if err != nil {
		t.Fatalf("unexpected error reserving license: %v", err)
	}
	_, err = lm.ReserveSpendLicense(200)
	if err == nil {
		t.Fatal("expected error due to envelope exceeded, got nil")
	}
}

func TestReserveSpendLicense_ResetMonthlySpend(t *testing.T) {
	lm := NewLicenseManager()
	_, err := lm.ReserveSpendLicense(800)
	if err != nil {
		t.Fatalf("unexpected error reserving license: %v", err)
	}

	// Simulate month change
	lm.mu.Lock()
	lm.currentMonth--
	lm.mu.Unlock()

	_, err = lm.ReserveSpendLicense(800)
	if err != nil {
		t.Fatalf("expected reset monthly spend, got error: %v", err)
	}
}

func TestFanOutLicense(t *testing.T) {
	lm := NewLicenseManager()
	license, err := lm.ReserveSpendLicense(100)
	if err != nil {
		t.Fatalf("unexpected error reserving license: %v", err)
	}

	err = lm.FanOutLicense(license.ID)
	if err != nil {
		t.Fatalf("unexpected error fanning out license: %v", err)
	}

	err = lm.FanOutLicense(license.ID)
	if err == nil {
		t.Fatal("expected error on double fan-out, got nil")
	}
}

func TestAcceptLicense_Success(t *testing.T) {
	lm := NewLicenseManager()
	license, err := lm.ReserveSpendLicense(100)
	if err != nil {
		t.Fatalf("unexpected error reserving license: %v", err)
	}

	receipt, err := lm.AcceptLicense(license.ID, license.IDBadge)
	if err != nil {
		t.Fatalf("unexpected error accepting license: %v", err)
	}
	if receipt.LicenseID != license.ID {
		t.Errorf("receipt license ID mismatch: got %s want %s", receipt.LicenseID, license.ID)
	}
}

func TestAcceptLicense_InvalidBadge(t *testing.T) {
	lm := NewLicenseManager()
	license, err := lm.ReserveSpendLicense(100)
	if err != nil {
		t.Fatalf("unexpected error reserving license: %v", err)
	}

	_, err = lm.AcceptLicense(license.ID, "BADGE-999")
	if err == nil {
		t.Fatal("expected error for invalid badge, got nil")
	}
}
