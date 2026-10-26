package programruntime

import (
	"testing"
)

func TestLicenseManager_ReserveLicense(t *testing.T) {
	lm := NewLicenseManager()

	// Reserve valid license
	lic, err := lm.ReserveLicense("lic1", 3.0)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if lic.Amount != 3.0 {
		t.Errorf("expected amount 3.0, got %v", lic.Amount)
	}

	// Reserve license exceeding envelope
	_, err = lm.ReserveLicense("lic2", 6.0)
	if err == nil {
		t.Errorf("expected error for exceeding envelope")
	}

	// Reserve license with duplicate ID
	_, err = lm.ReserveLicense("lic1", 1.0)
	if err == nil {
		t.Errorf("expected error for duplicate license ID")
	}

	// Reserve license with zero or negative amount
	_, err = lm.ReserveLicense("lic3", 0)
	if err == nil {
		t.Errorf("expected error for zero amount")
	}
}

func TestLicenseManager_FanOutIssueAcceptWriteBack(t *testing.T) {
	lm := NewLicenseManager()
	lic, err := lm.ReserveLicense("lic1", 2.0)
	if err != nil {
		t.Fatalf("reserve error: %v", err)
	}

	// Fan out license
	err = lm.FanOutLicense(lic.ID)
	if err != nil {
		t.Errorf("fan out error: %v", err)
	}
	// Fan out again should error
	err = lm.FanOutLicense(lic.ID)
	if err == nil {
		t.Errorf("expected error on second fan out")
	}

	// Issue ID badge
	err = lm.IssueIDBadge(lic.ID, "badge123")
	if err != nil {
		t.Errorf("issue badge error: %v", err)
	}
	// Issue badge again should error
	err = lm.IssueIDBadge(lic.ID, "badge456")
	if err == nil {
		t.Errorf("expected error on second badge issue")
	}

	// Accept license
	err = lm.AcceptLicense(lic.ID)
	if err != nil {
		t.Errorf("accept license error: %v", err)
	}
	// Accept again should error
	err = lm.AcceptLicense(lic.ID)
	if err == nil {
		t.Errorf("expected error on second accept")
	}

	// Write back usage
	err = lm.WriteBackUsage(lic.ID)
	if err != nil {
		t.Errorf("write back error: %v", err)
	}
	// Write back again should error
	err = lm.WriteBackUsage(lic.ID)
	if err == nil {
		t.Errorf("expected error on second write back")
	}
}

func TestLicenseManager_WriteBackWithoutShipReceipt(t *testing.T) {
	lm := NewLicenseManager()
	lic, err := lm.ReserveLicense("lic2", 1.0)
	if err != nil {
		t.Fatalf("reserve error: %v", err)
	}

	// Try write back before accept (ship receipt)
	err = lm.WriteBackUsage(lic.ID)
	if err == nil {
		t.Errorf("expected error writing back without ship receipt")
	}
}
