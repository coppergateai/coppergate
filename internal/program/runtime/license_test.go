package runtime

import (
	"testing"
	"time"
)

func TestLicenseManager_IssueIDBadge(t *testing.T) {
	lm := NewLicenseManager()
	badge := lm.IssueIDBadge("prog1")
	if badge.ProgramID != "prog1" {
		t.Errorf("expected ProgramID 'prog1', got %s", badge.ProgramID)
	}
	if !badge.Valid {
		t.Errorf("expected badge to be valid")
	}
}

func TestLicenseManager_ReserveSpendLicense(t *testing.T) {
	lm := NewLicenseManager()
	progID := "prog2"
	_, err := lm.ReserveSpendLicense(progID, 1)
	if err == nil {
		t.Errorf("expected error for missing badge")
	}

	lm.IssueIDBadge(progID)
	license, err := lm.ReserveSpendLicense(progID, 5)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if license.Amount != 5 {
		t.Errorf("expected license amount 5, got %f", license.Amount)
	}

	// Exceed monthly envelope
	_, err = lm.ReserveSpendLicense(progID, 4)
	if err == nil {
		t.Errorf("expected error for exceeding monthly envelope")
	}
}

func TestSpendLicense_AcceptContract(t *testing.T) {
	lm := NewLicenseManager()
	progID := "prog3"
	lm.IssueIDBadge(progID)
	license, err := lm.ReserveSpendLicense(progID, 3)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	receipt, err := license.AcceptContract()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if receipt.Amount != 3 {
		t.Errorf("expected receipt amount 3, got %f", receipt.Amount)
	}

	// Accepting again should error
	_, err = license.AcceptContract()
	if err == nil {
		t.Errorf("expected error on second accept")
	}
}

func TestSpendLicense_ConsumeSpend(t *testing.T) {
	lm := NewLicenseManager()
	progID := "prog4"
	lm.IssueIDBadge(progID)
	license, err := lm.ReserveSpendLicense(progID, 4)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	err = license.ConsumeSpend(2)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if license.Consumed != 2 {
		t.Errorf("expected consumed 2, got %f", license.Consumed)
	}

	err = license.ConsumeSpend(3)
	if err == nil {
		t.Errorf("expected error for exceeding spend license")
	}
}

func TestLicenseManager_MonthlyReset(t *testing.T) {
	lm := NewLicenseManager()
	progID := "prog5"
	lm.IssueIDBadge(progID)

	// Reserve full envelope
	_, err := lm.ReserveSpendLicense(progID, MonthlySpendEnvelope)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// Simulate month passing
	lm.currentMonth = lm.currentMonth.Add(-31 * 24 * time.Hour)

	// Should reset monthly spend and allow reservation again
	license, err := lm.ReserveSpendLicense(progID, MonthlySpendEnvelope)
	if err != nil {
		t.Fatalf("unexpected error after month reset: %v", err)
	}
	if license.Amount != MonthlySpendEnvelope {
		t.Errorf("expected license amount %f, got %f", MonthlySpendEnvelope, license.Amount)
	}
}
