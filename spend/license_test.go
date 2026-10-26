package spend

import (
	"testing"
	"time"
)

func TestReserveLicense(t *testing.T) {
	m := NewManager()
	license, err := m.ReserveLicense("program1", 8)
	if err != nil {
		t.Fatalf("ReserveLicense failed: %v", err)
	}
	if license.ProgramID != "program1" {
		t.Errorf("expected ProgramID 'program1', got %s", license.ProgramID)
	}
	if license.Amount != 8 {
		t.Errorf("expected Amount 8, got %f", license.Amount)
	}
}

func TestFanOutLicense(t *testing.T) {
	m := NewManager()
	license, err := m.ReserveLicense("program1", 8)
	if err != nil {
		t.Fatalf("ReserveLicense failed: %v", err)
	}
	subcontracts := []string{"sub1", "sub2", "sub3"}
	badges, err := m.FanOutLicense(license.ID, subcontracts)
	if err != nil {
		t.Fatalf("FanOutLicense failed: %v", err)
	}
	if len(badges) != len(subcontracts) {
		t.Errorf("expected %d badges, got %d", len(subcontracts), len(badges))
	}
	for i, badge := range badges {
		if badge.Subcontract != subcontracts[i] {
			t.Errorf("expected subcontract %s, got %s", subcontracts[i], badge.Subcontract)
		}
	}
}

func TestAcceptLicenseAndReceipt(t *testing.T) {
	m := NewManager()
	license, err := m.ReserveLicense("program1", 8)
	if err != nil {
		t.Fatalf("ReserveLicense failed: %v", err)
	}
	subcontracts := []string{"sub1"}
	badges, err := m.FanOutLicense(license.ID, subcontracts)
	if err != nil {
		t.Fatalf("FanOutLicense failed: %v", err)
	}
	badge := badges[0]

	receipt, err := m.AcceptLicense(badge.BadgeID)
	if err != nil {
		t.Fatalf("AcceptLicense failed: %v", err)
	}
	if receipt.BadgeID != badge.BadgeID {
		t.Errorf("receipt BadgeID mismatch: expected %s, got %s", badge.BadgeID, receipt.BadgeID)
	}

	// Accepting again should fail
	_, err = m.AcceptLicense(badge.BadgeID)
	if err == nil {
		t.Errorf("expected error on double accept, got nil")
	}

	// GetReceipt should return the receipt
	gotReceipt, err := m.GetReceipt(badge.BadgeID)
	if err != nil {
		t.Fatalf("GetReceipt failed: %v", err)
	}
	if gotReceipt.ReceiptID != receipt.ReceiptID {
		t.Errorf("receipt ID mismatch: expected %s, got %s", receipt.ReceiptID, gotReceipt.ReceiptID)
	}
}

func TestFanOutAfterAccept(t *testing.T) {
	m := NewManager()
	license, err := m.ReserveLicense("program1", 8)
	if err != nil {
		t.Fatalf("ReserveLicense failed: %v", err)
	}
	subcontracts := []string{"sub1"}
	badges, err := m.FanOutLicense(license.ID, subcontracts)
	if err != nil {
		t.Fatalf("FanOutLicense failed: %v", err)
	}
	badge := badges[0]

	_, err = m.AcceptLicense(badge.BadgeID)
	if err != nil {
		t.Fatalf("AcceptLicense failed: %v", err)
	}

	// Attempt to fan out after acceptance should fail
	_, err = m.FanOutLicense(license.ID, []string{"sub2"})
	if err == nil {
		t.Errorf("expected error on fan out after accept, got nil")
	}
}

func TestInvalidInputs(t *testing.T) {
	m := NewManager()
	_, err := m.ReserveLicense("program1", 0)
	if err == nil {
		t.Errorf("expected error on zero amount, got nil")
	}

	_, err = m.FanOutLicense("nonexistent", []string{"sub1"})
	if err == nil {
		t.Errorf("expected error on fan out with invalid license, got nil")
	}

	_, err = m.AcceptLicense("nonexistent-badge")
	if err == nil {
		t.Errorf("expected error on accept with invalid badge, got nil")
	}

	_, err = m.GetReceipt("nonexistent-badge")
	if err == nil {
		t.Errorf("expected error on get receipt with invalid badge, got nil")
	}
}

func TestConcurrentFanOutUniqueBadges(t *testing.T) {
	m := NewManager()
	license, err := m.ReserveLicense("program1", 8)
	if err != nil {
		t.Fatalf("ReserveLicense failed: %v", err)
	}
	subcontracts := []string{"sub1", "sub2", "sub3", "sub4", "sub5"}

	badges, err := m.FanOutLicense(license.ID, subcontracts)
	if err != nil {
		t.Fatalf("FanOutLicense failed: %v", err)
	}

	badgeIDs := make(map[string]bool)
	for _, badge := range badges {
		if badgeIDs[badge.BadgeID] {
			t.Errorf("duplicate badge ID found: %s", badge.BadgeID)
		}
		badgeIDs[badge.BadgeID] = true
	}
}
