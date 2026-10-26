package programruntime

import (
	"testing"
)

func TestLicenseManager_ReserveAcceptWriteBack(t *testing.T) {
	lm := NewLicenseManager(8.0)

	// Reserve a license within envelope
	licID, err := lm.ReserveLicense(5.0, "badge-123")
	if err != nil {
		t.Fatalf("ReserveLicense failed: %v", err)
	}

	// Accept license
	receipt, err := lm.AcceptLicense(licID)
	if err != nil {
		t.Fatalf("AcceptLicense failed: %v", err)
	}
	if receipt == "" {
		t.Fatal("AcceptLicense returned empty receipt")
	}

	// Writeback license
	err = lm.WriteBackLicense(licID)
	if err != nil {
		t.Fatalf("WriteBackLicense failed: %v", err)
	}

	// Verify license state
	lic, err := lm.GetLicense(licID)
	if err != nil {
		t.Fatalf("GetLicense failed: %v", err)
	}
	if !lic.IsAccepted || !lic.IsWrittenBack {
		t.Fatal("License state not updated correctly")
	}
}

func TestLicenseManager_EnvelopeExceeded(t *testing.T) {
	lm := NewLicenseManager(8.0)

	_, err := lm.ReserveLicense(9.0, "badge-1")
	if err == nil {
		t.Fatal("Expected error for spend exceeding envelope")
	}
}

func TestLicenseManager_FanOut(t *testing.T) {
	lm := NewLicenseManager(8.0)

	licID, err := lm.ReserveLicense(3.0, "badge-1")
	if err != nil {
		t.Fatalf("ReserveLicense failed: %v", err)
	}

	// Accept original license
	_, err = lm.AcceptLicense(licID)
	if err != nil {
		t.Fatalf("AcceptLicense failed: %v", err)
	}

	// Fan-out license
	fanOutID, err := lm.FanOutLicense(licID, "badge-2")
	if err != nil {
		t.Fatalf("FanOutLicense failed: %v", err)
	}

	// Accept fan-out license
	receipt, err := lm.AcceptLicense(fanOutID)
	if err != nil {
		t.Fatalf("AcceptLicense (fan-out) failed: %v", err)
	}
	if receipt == "" {
		t.Fatal("AcceptLicense (fan-out) returned empty receipt")
	}
}

func TestLicenseManager_FanOutBeforeAccept(t *testing.T) {
	lm := NewLicenseManager(8.0)

	licID, err := lm.ReserveLicense(3.0, "badge-1")
	if err != nil {
		t.Fatalf("ReserveLicense failed: %v", err)
	}

	// Attempt fan-out before acceptance
	_, err = lm.FanOutLicense(licID, "badge-2")
	if err == nil {
		t.Fatal("Expected error for fan-out before acceptance")
	}
}
