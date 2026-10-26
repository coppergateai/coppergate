package programruntime

import (
	"testing"
)

func TestSpendLicenseReserve(t *testing.T) {
	sl := NewSpendLicense(800) // $8.00

	err := sl.Reserve(300)
	if err != nil {
		t.Fatalf("unexpected error reserving 300 cents: %v", err)
	}

	if sl.ReservedCents != 300 {
		t.Errorf("expected ReservedCents=300, got %d", sl.ReservedCents)
	}

	err = sl.Reserve(600)
	if err == nil {
		t.Errorf("expected error reserving 600 cents exceeding envelope, got nil")
	}
}

func TestSpendLicenseFanOut(t *testing.T) {
	sl := NewSpendLicense(800)
	err := sl.Reserve(500)
	if err != nil {
		t.Fatalf("reserve failed: %v", err)
	}

	err = sl.FanOut([]int64{200, 100, 150})
	if err != nil {
		t.Fatalf("fan-out failed: %v", err)
	}

	if sl.ReservedCents != 50 {
		t.Errorf("expected ReservedCents=50 after fan-out, got %d", sl.ReservedCents)
	}

	err = sl.FanOut([]int64{60})
	if err == nil {
		t.Errorf("expected error fan-out exceeding reserved, got nil")
	}
}

func TestAcceptUsage(t *testing.T) {
	sl := NewSpendLicense(800)

	receipt, err := sl.AcceptUsage(300)
	if err != nil {
		t.Fatalf("accept usage failed: %v", err)
	}

	if receipt.AmountCents != 300 {
		t.Errorf("expected receipt amount 300, got %d", receipt.AmountCents)
	}

	if sl.MonthlyEnvelopeCents != 500 {
		t.Errorf("expected MonthlyEnvelopeCents=500 after accept, got %d", sl.MonthlyEnvelopeCents)
	}

	_, err = sl.AcceptUsage(600)
	if err == nil {
		t.Errorf("expected error accepting usage exceeding envelope, got nil")
	}
}
