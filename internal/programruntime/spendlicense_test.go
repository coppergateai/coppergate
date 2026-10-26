package programruntime

import (
	"testing"
)

func TestReserveSpendLicense(t *testing.T) {
	manager := NewSpendLicenseManager(8.0)

	// Test valid reservation
	license, err := manager.ReserveSpendLicense("prog1", 5.0)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if license.ProgramID != "prog1" {
		t.Errorf("expected programID 'prog1', got %s", license.ProgramID)
	}
	if license.Amount != 5.0 {
		t.Errorf("expected amount 5.0, got %.2f", license.Amount)
	}
	if license.IsActive {
		t.Errorf("license should not be active on reservation")
	}

	// Test zero or negative amount
	_, err = manager.ReserveSpendLicense("prog1", 0)
	if err == nil {
		t.Errorf("expected error for zero amount")
	}

	_, err = manager.ReserveSpendLicense("prog1", -1)
	if err == nil {
		t.Errorf("expected error for negative amount")
	}

	// Test amount exceeding envelope
	_, err = manager.ReserveSpendLicense("prog1", 10)
	if err == nil {
		t.Errorf("expected error for amount exceeding envelope")
	}
}

func TestAcceptSpendLicense(t *testing.T) {
	manager := NewSpendLicenseManager(8.0)

	license, err := manager.ReserveSpendLicense("prog2", 3.0)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	receipt, err := manager.AcceptSpendLicense(license.ID)
	if err != nil {
		t.Fatalf("unexpected error on accept: %v", err)
	}
	if receipt == "" {
		t.Errorf("expected non-empty ship receipt")
	}

	// Accepting again should error
	_, err = manager.AcceptSpendLicense(license.ID)
	if err == nil {
		t.Errorf("expected error on second accept")
	}

	// Accept non-existent license
	_, err = manager.AcceptSpendLicense("nonexistent")
	if err == nil {
		t.Errorf("expected error on accept non-existent license")
	}
}

func TestWritebackSpendLicense(t *testing.T) {
	manager := NewSpendLicenseManager(8.0)

	license, err := manager.ReserveSpendLicense("prog3", 4.0)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// Writeback before accept should error
	err = manager.WritebackSpendLicense(license.ID)
	if err == nil {
		t.Errorf("expected error writing back inactive license")
	}

	_, err = manager.AcceptSpendLicense(license.ID)
	if err != nil {
		t.Fatalf("unexpected error on accept: %v", err)
	}

	err = manager.WritebackSpendLicense(license.ID)
	if err != nil {
		t.Errorf("unexpected error on writeback: %v", err)
	}

	// Writeback again should error
	err = manager.WritebackSpendLicense(license.ID)
	if err == nil {
		t.Errorf("expected error on second writeback")
	}

	// Writeback non-existent license
	err = manager.WritebackSpendLicense("nonexistent")
	if err == nil {
		t.Errorf("expected error on writeback non-existent license")
	}
}
