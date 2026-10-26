package runtime

import (
	"testing"
	"time"
)

func TestReserveSpendLicense(t *testing.T) {
	rm := NewRuntimeManager(8.0)
	programID := "prog1"
	licenseID := "lic1"

	// Reserve within envelope
	license, err := rm.ReserveSpendLicense(programID, licenseID, "Test license", 5.0)
	if err != nil {
		t.Fatalf("unexpected error reserving license: %v", err)
	}
	if license.Amount != 5.0 {
		t.Errorf("expected amount 5.0, got %v", license.Amount)
	}

	// Reserve exceeding envelope
	_, err = rm.ReserveSpendLicense(programID, "lic2", "Exceed license", 4.0)
	if err == nil {
		t.Errorf("expected error for exceeding envelope, got nil")
	}
}

func TestIssueIDBadge(t *testing.T) {
	rm := NewRuntimeManager(8.0)
	badgeID := "badge1"
	agentID := "agent1"
	programID := "prog1"

	badge, err := rm.IssueIDBadge(badgeID, agentID, programID, time.Hour)
	if err != nil {
		t.Fatalf("unexpected error issuing badge: %v", err)
	}
	if badge.BadgeID != badgeID {
		t.Errorf("expected badgeID %s, got %s", badgeID, badge.BadgeID)
	}
}

func TestAcceptSpendLicense(t *testing.T) {
	rm := NewRuntimeManager(8.0)
	programID := "prog1"
	licenseID := "lic1"
	badgeID := "badge1"
	agentID := "agent1"

	// Setup license and badge
	_, err := rm.ReserveSpendLicense(programID, licenseID, "Test license", 3.0)
	if err != nil {
		t.Fatalf("reserve license error: %v", err)
	}
	_, err = rm.IssueIDBadge(badgeID, agentID, programID, time.Hour)
	if err != nil {
		t.Fatalf("issue badge error: %v", err)
	}

	// Accept license
	receipt, err := rm.AcceptSpendLicense(licenseID, badgeID)
	if err != nil {
		t.Fatalf("accept license error: %v", err)
	}
	if receipt.LicenseID != licenseID {
		t.Errorf("receipt license ID mismatch: got %s", receipt.LicenseID)
	}

	// Accept again should fail
	_, err = rm.AcceptSpendLicense(licenseID, badgeID)
	if err == nil {
		t.Errorf("expected error on double consume, got nil")
	}
}

func TestAcceptSpendLicenseBadgeExpired(t *testing.T) {
	rm := NewRuntimeManager(8.0)
	programID := "prog1"
	licenseID := "lic1"
	badgeID := "badge1"
	agentID := "agent1"

	_, err := rm.ReserveSpendLicense(programID, licenseID, "Test license", 3.0)
	if err != nil {
		t.Fatalf("reserve license error: %v", err)
	}
	// Badge valid for -1 hour (expired)
	_, err = rm.IssueIDBadge(badgeID, agentID, programID, -1*time.Hour)
	if err != nil {
		t.Fatalf("issue badge error: %v", err)
	}

	_, err = rm.AcceptSpendLicense(licenseID, badgeID)
	if err == nil {
		t.Errorf("expected error on expired badge, got nil")
	}
}

func TestLandingWriteback(t *testing.T) {
	rm := NewRuntimeManager(8.0)
	programID := "prog1"
	licenseID := "lic1"
	badgeID := "badge1"
	agentID := "agent1"

	_, err := rm.ReserveSpendLicense(programID, licenseID, "Test license", 2.0)
	if err != nil {
		t.Fatalf("reserve license error: %v", err)
	}
	_, err = rm.IssueIDBadge(badgeID, agentID, programID, time.Hour)
	if err != nil {
		t.Fatalf("issue badge error: %v", err)
	}
	_, err = rm.AcceptSpendLicense(licenseID, badgeID)
	if err != nil {
		t.Fatalf("accept license error: %v", err)
	}

	err = rm.LandingWriteback(programID)
	if err != nil {
		t.Errorf("landing writeback error: %v", err)
	}
}
