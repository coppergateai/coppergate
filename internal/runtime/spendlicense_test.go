package runtime

import (
	"testing"
	"time"
)

func TestIssueAndValidateIDBadge(t *testing.T) {
	mgr := NewSpendLicenseManager()
	programID := "prog-123"

	badge := mgr.IssueIDBadge(programID)
	if badge.ProgramID != programID {
		t.Fatalf("expected ProgramID %s, got %s", programID, badge.ProgramID)
	}

	valid := mgr.ValidateIDBadge(badge)
	if !valid {
		t.Fatal("expected badge to be valid")
	}

	// Tampered badge should fail
	badBadge := IDBadge{
		ProgramID: programID,
		IssuedAt:  time.Now(),
		Valid:     true,
	}
	if mgr.ValidateIDBadge(badBadge) {
		t.Fatal("expected tampered badge to be invalid")
	}
}

func TestReserveSpendLicenseWithinEnvelope(t *testing.T) {
	mgr := NewSpendLicenseManager()
	programID := "prog-456"

	// Reserve $5, should succeed
	license, err := mgr.ReserveSpendLicense(programID, 5)
	if err != nil {
		t.Fatalf("unexpected error reserving license: %v", err)
	}
	if license.Amount != 5 {
		t.Fatalf("expected amount 5, got %f", license.Amount)
	}

	// Reserve $4, should fail (5+4 > 8)
	_, err = mgr.ReserveSpendLicense(programID, 4)
	if err == nil {
		t.Fatal("expected error due to envelope exceeded")
	}

	// Reserve $3, should succeed (5+3=8)
	license2, err := mgr.ReserveSpendLicense(programID, 3)
	if err != nil {
		t.Fatalf("unexpected error reserving license: %v", err)
	}
	if license2.Amount != 3 {
		t.Fatalf("expected amount 3, got %f", license2.Amount)
	}
}

func TestAcceptSpendLicense(t *testing.T) {
	mgr := NewSpendLicenseManager()
	programID := "prog-789"

	license, err := mgr.ReserveSpendLicense(programID, 2)
	if err != nil {
		t.Fatalf("unexpected error reserving license: %v", err)
	}

	receipt, err := mgr.AcceptSpendLicense(license.LicenseID)
	if err != nil {
		t.Fatalf("unexpected error accepting license: %v", err)
	}
	if receipt == "" {
		t.Fatal("expected non-empty ship receipt")
	}

	// Accepting again should fail
	_, err = mgr.AcceptSpendLicense(license.LicenseID)
	if err == nil {
		t.Fatal("expected error on double accept")
	}
}

func TestLandingWriteback(t *testing.T) {
	mgr := NewSpendLicenseManager()
	programID := "prog-101"

	license, err := mgr.ReserveSpendLicense(programID, 1)
	if err != nil {
		t.Fatalf("unexpected error reserving license: %v", err)
	}

	// Landing before accept should fail
	err = mgr.LandingWriteback(license.LicenseID)
	if err == nil {
		t.Fatal("expected error landing unaccepted license")
	}

	_, err = mgr.AcceptSpendLicense(license.LicenseID)
	if err != nil {
		t.Fatalf("unexpected error accepting license: %v", err)
	}

	err = mgr.LandingWriteback(license.LicenseID)
	if err != nil {
		t.Fatalf("unexpected error landing accepted license: %v", err)
	}
}
