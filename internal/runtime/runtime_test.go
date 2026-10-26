package runtime

import (
	"testing"
	"time"
)

func TestLicenseManager_ReserveAndFanOut(t *testing.T) {
	lm := NewLicenseManager(8.0)

	// Reserve a license within envelope
	if err := lm.ReserveLicense("lic1", 5.0); err != nil {
		t.Fatalf("ReserveLicense failed: %v", err)
	}

	// Reserve license exceeding envelope
	if err := lm.ReserveLicense("lic2", 4.0); err == nil {
		t.Fatalf("ReserveLicense should fail exceeding envelope")
	}

	// Fan out license within parent amount
	if err := lm.FanOutLicense("lic1", "lic1a", 3.0); err != nil {
		t.Fatalf("FanOutLicense failed: %v", err)
	}

	// Fan out license exceeding parent amount
	if err := lm.FanOutLicense("lic1", "lic1b", 3.0); err == nil {
		t.Fatalf("FanOutLicense should fail insufficient amount")
	}

	// Consume license
	if err := lm.ConsumeLicense("lic1a", 2.0); err != nil {
		t.Fatalf("ConsumeLicense failed: %v", err)
	}

	// Consume license exceeding amount
	if err := lm.ConsumeLicense("lic1a", 2.0); err == nil {
		t.Fatalf("ConsumeLicense should fail insufficient amount")
	}
}

func TestBadgeManager_IssueValidateRevoke(t *testing.T) {
	bm := NewBadgeManager()

	err := bm.IssueBadge("badge1", "prog1", time.Second*1)
	if err != nil {
		t.Fatalf("IssueBadge failed: %v", err)
	}

	valid, err := bm.ValidateBadge("badge1")
	if err != nil {
		t.Fatalf("ValidateBadge failed: %v", err)
	}
	if !valid {
		t.Fatalf("Badge should be valid immediately after issuance")
	}

	time.Sleep(time.Second * 2)
	valid, err = bm.ValidateBadge("badge1")
	if err != nil {
		t.Fatalf("ValidateBadge failed: %v", err)
	}
	if valid {
		t.Fatalf("Badge should be invalid after expiration")
	}

	err = bm.RevokeBadge("badge1")
	if err != nil {
		t.Fatalf("RevokeBadge failed: %v", err)
	}
}

func TestReceiptManager_AcceptAndGet(t *testing.T) {
	rm := NewReceiptManager()

	err := rm.AcceptReceipt("rcpt1", "lic1", 3.5)
	if err != nil {
		t.Fatalf("AcceptReceipt failed: %v", err)
	}

	rcpt, err := rm.GetReceipt("rcpt1")
	if err != nil {
		t.Fatalf("GetReceipt failed: %v", err)
	}
	if rcpt.Amount != 3.5 || !rcpt.Accepted {
		t.Fatalf("Receipt data mismatch")
	}

	// Duplicate receipt ID
	err = rm.AcceptReceipt("rcpt1", "lic1", 1.0)
	if err == nil {
		t.Fatalf("AcceptReceipt should fail duplicate receipt ID")
	}
}
