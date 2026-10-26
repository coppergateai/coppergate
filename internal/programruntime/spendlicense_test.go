package programruntime

import (
	"testing"
)

func TestNewSpendLicense(t *testing.T) {
	sl, err := NewSpendLicense("id1", 800, 500)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if sl.ID != "id1" {
		t.Errorf("expected ID 'id1', got %s", sl.ID)
	}
	if sl.Reserved != 500 {
		t.Errorf("expected reserved 500, got %d", sl.Reserved)
	}
	if sl.Envelope != 800 {
		t.Errorf("expected envelope 800, got %d", sl.Envelope)
	}
}

func TestNewSpendLicenseReserveExceedsEnvelope(t *testing.T) {
	_, err := NewSpendLicense("id2", 800, 900)
	if err == nil {
		t.Fatal("expected error for reserve exceeding envelope")
	}
}

func TestFanOut(t *testing.T) {
	sl, _ := NewSpendLicense("id1", 800, 600)
	sub, err := sl.FanOut("id2", 300)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if sub.ID != "id2" {
		t.Errorf("expected sub ID 'id2', got %s", sub.ID)
	}
	if sub.Reserved != 300 {
		t.Errorf("expected sub reserved 300, got %d", sub.Reserved)
	}
	if sl.Used != 300 {
		t.Errorf("expected used 300, got %d", sl.Used)
	}
}

func TestFanOutInsufficientReserve(t *testing.T) {
	sl, _ := NewSpendLicense("id1", 800, 400)
	_, err := sl.FanOut("id2", 500)
	if err == nil {
		t.Fatal("expected error for fan out exceeding reserved")
	}
}

func TestAccept(t *testing.T) {
	sl, _ := NewSpendLicense("id1", 800, 500)
	receipt, err := sl.Accept()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !sl.Accepted {
		t.Error("expected license to be accepted")
	}
	if receipt.LicenseID != sl.ID {
		t.Errorf("receipt LicenseID mismatch: got %s, want %s", receipt.LicenseID, sl.ID)
	}
}

func TestAcceptTwice(t *testing.T) {
	sl, _ := NewSpendLicense("id1", 800, 500)
	_, err := sl.Accept()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	_, err = sl.Accept()
	if err == nil {
		t.Fatal("expected error on second accept")
	}
}

func TestLandingWriteback(t *testing.T) {
	sl, _ := NewSpendLicense("id1", 800, 500)
	err := sl.LandingWriteback()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}
