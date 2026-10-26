package programruntime

import (
	"testing"
	"time"
)

func TestLicenseManager_ReserveAcceptShip(t *testing.T) {
	lm := NewLicenseManager(8.0)
	programID := "prog-1"

	// Reserve license within envelope
	license, err := lm.ReserveLicense("lic-1", programID, 5.0)
	if err != nil {
		t.Fatalf("ReserveLicense failed: %v", err)
	}
	if license.Status != StatusReserved {
		t.Errorf("expected StatusReserved, got %v", license.Status)
	}

	// Accept license
	license, err = lm.AcceptLicense("lic-1")
	if err != nil {
		t.Fatalf("AcceptLicense failed: %v", err)
	}
	if license.Status != StatusAccepted {
		t.Errorf("expected StatusAccepted, got %v", license.Status)
	}
	if license.AcceptedAt == nil {
		t.Errorf("expected AcceptedAt to be set")
	}

	// Ship receipt
	license, err = lm.ShipReceipt("lic-1")
	if err != nil {
		t.Fatalf("ShipReceipt failed: %v", err)
	}
	if license.Status != StatusShipped {
		t.Errorf("expected StatusShipped, got %v", license.Status)
	}
	if license.ShippedAt == nil {
		t.Errorf("expected ShippedAt to be set")
	}
}

func TestLicenseManager_EnvelopeExceeded(t *testing.T) {
	lm := NewLicenseManager(8.0)
	programID := "prog-2"

	// Reserve license exceeding envelope
	_, err := lm.ReserveLicense("lic-2", programID, 9.0)
	if err == nil {
		t.Fatalf("expected error on reserve exceeding envelope")
	}

	// Reserve license within envelope
	_, err = lm.ReserveLicense("lic-3", programID, 5.0)
	if err != nil {
		t.Fatalf("ReserveLicense failed: %v", err)
	}

	// Accept license
	_, err = lm.AcceptLicense("lic-3")
	if err != nil {
		t.Fatalf("AcceptLicense failed: %v", err)
	}

	// Reserve another license that would exceed envelope when accepted
	_, err = lm.ReserveLicense("lic-4", programID, 4.0)
	if err != nil {
		t.Fatalf("ReserveLicense failed: %v", err)
	}

	// Accept license should fail due to envelope exceeded
	_, err = lm.AcceptLicense("lic-4")
	if err == nil {
		t.Fatalf("expected error on accept exceeding envelope")
	}
}

func TestLicenseManager_InvalidTransitions(t *testing.T) {
	lm := NewLicenseManager(8.0)
	programID := "prog-3"

	// Accept non-existent license
	_, err := lm.AcceptLicense("nonexistent")
	if err == nil {
		t.Fatalf("expected error on accept non-existent license")
	}

	// Ship non-existent license
	_, err = lm.ShipReceipt("nonexistent")
	if err == nil {
		t.Fatalf("expected error on ship non-existent license")
	}

	// Reserve and accept license
	_, err = lm.ReserveLicense("lic-5", programID, 3.0)
	if err != nil {
		t.Fatalf("ReserveLicense failed: %v", err)
	}
	_, err = lm.AcceptLicense("lic-5")
	if err != nil {
		t.Fatalf("AcceptLicense failed: %v", err)
	}

	// Accept again should fail
	_, err = lm.AcceptLicense("lic-5")
	if err == nil {
		t.Fatalf("expected error on accept license not in reserved state")
	}

	// Ship license
	_, err = lm.ShipReceipt("lic-5")
	if err != nil {
		t.Fatalf("ShipReceipt failed: %v", err)
	}

	// Ship again should fail
	_, err = lm.ShipReceipt("lic-5")
	if err == nil {
		t.Fatalf("expected error on ship license not in accepted state")
	}
}

func TestLicenseManager_GetLicense(t *testing.T) {
	lm := NewLicenseManager(8.0)
	programID := "prog-4"

	_, err := lm.ReserveLicense("lic-6", programID, 2.0)
	if err != nil {
		t.Fatalf("ReserveLicense failed: %v", err)
	}

	license, err := lm.GetLicense("lic-6")
	if err != nil {
		t.Fatalf("GetLicense failed: %v", err)
	}
	if license.ID != "lic-6" {
		t.Errorf("expected license ID lic-6, got %s", license.ID)
	}

	_, err = lm.GetLicense("nonexistent")
	if err == nil {
		t.Fatalf("expected error on get non-existent license")
	}
}

func TestLicenseManager_MonthlyEnvelopeReset(t *testing.T) {
	// This test simulates monthly reset by clearing monthlySpent manually.
	lm := NewLicenseManager(8.0)
	programID := "prog-5"

	_, err := lm.ReserveLicense("lic-7", programID, 8.0)
	if err != nil {
		t.Fatalf("ReserveLicense failed: %v", err)
	}
	_, err = lm.AcceptLicense("lic-7")
	if err != nil {
		t.Fatalf("AcceptLicense failed: %v", err)
	}

	// Next reserve should fail due to envelope exceeded
	_, err = lm.ReserveLicense("lic-8", programID, 1.0)
	if err == nil {
		t.Fatalf("expected error on reserve exceeding envelope")
	}

	// Simulate monthly reset
	lm.mu.Lock()
	lm.monthlySpent[programID] = 0
	lm.mu.Unlock()

	// Now reserve should succeed
	_, err = lm.ReserveLicense("lic-8", programID, 1.0)
	if err != nil {
		t.Fatalf("ReserveLicense failed after reset: %v", err)
	}
}
