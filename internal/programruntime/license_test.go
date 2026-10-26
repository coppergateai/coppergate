package programruntime

import (
	"testing"
	"time"
)

func TestReserveLicense_Success(t *testing.T) {
	lm := NewLicenseManager()
	badge, err := lm.ReserveLicense(5)
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if badge == nil {
		t.Fatal("expected badge, got nil")
	}
	if badge.Valid != true {
		t.Errorf("expected badge valid true, got false")
	}
}

func TestReserveLicense_ExceedEnvelope(t *testing.T) {
	lm := NewLicenseManager()
	_, err := lm.ReserveLicense(5)
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	_, err = lm.ReserveLicense(4)
	if err == nil {
		t.Fatal("expected error for exceeding envelope, got none")
	}
}

func TestAcceptLicense_Success(t *testing.T) {
	lm := NewLicenseManager()
	badge, err := lm.ReserveLicense(3)
	if err != nil {
		t.Fatalf("reserve license failed: %v", err)
	}
	receipt, err := lm.AcceptLicense(badge.LicenseID)
	if err != nil {
		t.Fatalf("accept license failed: %v", err)
	}
	if receipt.Amount != 3 {
		t.Errorf("expected receipt amount 3, got %v", receipt.Amount)
	}
}

func TestAcceptLicense_AlreadyAccepted(t *testing.T) {
	lm := NewLicenseManager()
	badge, err := lm.ReserveLicense(2)
	if err != nil {
		t.Fatalf("reserve license failed: %v", err)
	}
	_, err = lm.AcceptLicense(badge.LicenseID)
	if err != nil {
		t.Fatalf("accept license failed: %v", err)
	}
	_, err = lm.AcceptLicense(badge.LicenseID)
	if err == nil {
		t.Fatal("expected error on second accept, got none")
	}
}

func TestAcceptLicense_InvalidBadge(t *testing.T) {
	lm := NewLicenseManager()
	badge, err := lm.ReserveLicense(1)
	if err != nil {
		t.Fatalf("reserve license failed: %v", err)
	}
	// Invalidate badge manually
	lm.mu.Lock()
	lm.licenses[badge.LicenseID].Badge.Valid = false
	lm.mu.Unlock()

	_, err = lm.AcceptLicense(badge.LicenseID)
	if err == nil {
		t.Fatal("expected error for invalid badge, got none")
	}
}

func TestReserveLicense_InvalidAmount(t *testing.T) {
	lm := NewLicenseManager()
	_, err := lm.ReserveLicense(0)
	if err == nil {
		t.Fatal("expected error for zero amount, got none")
	}
	_, err = lm.ReserveLicense(-1)
	if err == nil {
		t.Fatal("expected error for negative amount, got none")
	}
}

func TestConcurrentReserve(t *testing.T) {
	lm := NewLicenseManager()
	done := make(chan bool)
	for i := 0; i < 8; i++ {
		go func() {
			_, _ = lm.ReserveLicense(1)
			done <- true
		}()
	}
	for i := 0; i < 8; i++ {
		<-done
	}
	// Total reserved should not exceed 8
	if lm.totalReserved > MonthlySpendEnvelope {
		t.Errorf("total reserved %v exceeds envelope %v", lm.totalReserved, MonthlySpendEnvelope)
	}
}

func TestGenerateLicenseID_Unique(t *testing.T) {
	id1 := generateLicenseID()
	time.Sleep(1 * time.Millisecond)
	id2 := generateLicenseID()
	if id1 == id2 {
		t.Errorf("expected unique license IDs, got %v and %v", id1, id2)
	}
}
