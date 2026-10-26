package programruntime

import (
	"testing"
)

func TestReserveLicense(t *testing.T) {
	lm := NewLicenseManager(8.0)

	// Reserve 5 dollars - should succeed
	lic, err := lm.ReserveLicense("prog-1", 5.0)
	if err != nil {
		t.Fatalf("unexpected error reserving license: %v", err)
	}
	if lic.Amount != 5.0 {
		t.Errorf("expected amount 5.0, got %.2f", lic.Amount)
	}

	// Reserve 4 dollars - should fail (exceeds envelope)
	_, err = lm.ReserveLicense("prog-1", 4.0)
	if err == nil {
		t.Errorf("expected error reserving license exceeding envelope")
	}

	// Reserve 3 dollars - should succeed (total 8)
	lic2, err := lm.ReserveLicense("prog-1", 3.0)
	if err != nil {
		t.Fatalf("unexpected error reserving license: %v", err)
	}
	if lic2.Amount != 3.0 {
		t.Errorf("expected amount 3.0, got %.2f", lic2.Amount)
	}
}

func TestFanOutLicense(t *testing.T) {
	lm := NewLicenseManager(8.0)
	lic, err := lm.ReserveLicense("prog-1", 5.0)
	if err != nil {
		t.Fatalf("reserve license failed: %v", err)
	}

	err = lm.FanOutLicense(lic.ID, []string{"subprog-1", "subprog-2"})
	if err != nil {
		t.Fatalf("fan-out license failed: %v", err)
	}

	lic2, ok := lm.GetLicense(lic.ID)
	if !ok {
		t.Fatalf("license not found after fan-out")
	}
	if len(lic2.FannedOutTo) != 2 {
		t.Errorf("expected 2 fanned out sub-programs, got %d", len(lic2.FannedOutTo))
	}

	// Accept license and try fan-out again - should fail
	_, err = lm.AcceptLicense(lic.ID)
	if err != nil {
		t.Fatalf("accept license failed: %v", err)
	}
	err = lm.FanOutLicense(lic.ID, []string{"subprog-3"})
	if err == nil {
		t.Errorf("expected error fan-out after acceptance")
	}
}

func TestIssueIDBadge(t *testing.T) {
	lm := NewLicenseManager(8.0)
	badge := lm.IssueIDBadge("prog-1")
	if badge.ProgramID != "prog-1" {
		t.Errorf("badge ProgramID mismatch: got %s", badge.ProgramID)
	}
	if !badge.Valid {
		t.Errorf("badge should be valid on issue")
	}
}

func TestAcceptLicense(t *testing.T) {
	lm := NewLicenseManager(8.0)
	lic, err := lm.ReserveLicense("prog-1", 5.0)
	if err != nil {
		t.Fatalf("reserve license failed: %v", err)
	}

	receipt, err := lm.AcceptLicense(lic.ID)
	if err != nil {
		t.Fatalf("accept license failed: %v", err)
	}
	if receipt == "" {
		t.Errorf("expected non-empty receipt ID")
	}

	// Accept again should fail
	_, err = lm.AcceptLicense(lic.ID)
	if err == nil {
		t.Errorf("expected error on double acceptance")
	}
}
