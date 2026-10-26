package programruntime

import (
	"testing"
)

func TestSpendLicenseReserveRelease(t *testing.T) {
	sl := NewSpendLicense(800) // $8.00 in cents

	badge, err := sl.Reserve(500)
	if err != nil {
		t.Fatalf("unexpected error reserving license: %v", err)
	}
	if badge.ID == "" {
		t.Fatal("expected non-empty badge ID")
	}

	if sl.Used() != 500 {
		t.Fatalf("expected used to be 500, got %d", sl.Used())
	}

	// Reserve more than available
	_, err = sl.Reserve(400)
	if err == nil {
		t.Fatal("expected error reserving more than available")
	}

	sl.Release(200)
	if sl.Used() != 300 {
		t.Fatalf("expected used to be 300 after release, got %d", sl.Used())
	}

	// Release negative amount should not panic or change used
	sl.Release(-100)
	if sl.Used() != 300 {
		t.Fatalf("expected used to remain 300 after negative release, got %d", sl.Used())
	}
}

func TestIDBadgeValidation(t *testing.T) {
	badge := NewIDBadge()
	if err := badge.Validate(); err != nil {
		t.Fatalf("expected valid badge, got error: %v", err)
	}

	invalidBadge := IDBadge{ID: "short"}
	if err := invalidBadge.Validate(); err == nil {
		t.Fatal("expected error for invalid badge length")
	}
}

func TestAcceptManager(t *testing.T) {
	am := NewAcceptManager()
	sl := NewSpendLicense(800)

	badge, err := sl.Reserve(300)
	if err != nil {
		t.Fatalf("reserve failed: %v", err)
	}

	receipt, err := am.Accept(badge, 300)
	if err != nil {
		t.Fatalf("accept failed: %v", err)
	}
	if receipt.Amount != 300 {
		t.Fatalf("expected receipt amount 300, got %d", receipt.Amount)
	}

	// Accepting again should fail
	_, err = am.Accept(badge, 300)
	if err == nil {
		t.Fatal("expected error on duplicate accept")
	}

	// GetReceipt returns the receipt
	got, ok := am.GetReceipt(badge)
	if !ok {
		t.Fatal("expected receipt to exist")
	}
	if got.Amount != 300 {
		t.Fatalf("expected receipt amount 300, got %d", got.Amount)
	}
}

func TestLandingManager(t *testing.T) {
	lm := NewLandingManager()
	badge := NewIDBadge()

	err := lm.Land(badge)
	if err != nil {
		t.Fatalf("land failed: %v", err)
	}

	if !lm.IsLanded(badge) {
		t.Fatal("expected badge to be landed")
	}

	// Landing again should fail
	err = lm.Land(badge)
	if err == nil {
		t.Fatal("expected error on duplicate land")
	}
}
