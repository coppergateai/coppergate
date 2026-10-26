package programruntime

import (
	"testing"
)

func TestSpendLicense_ReserveSpend(t *testing.T) {
	sl := NewSpendLicense(800, "badge-123")

	// Reserve within limit
	if err := sl.ReserveSpend(500); err != nil {
		t.Fatalf("unexpected error reserving spend: %v", err)
	}

	// Reserve exceeding limit
	if err := sl.ReserveSpend(400); err != ErrSpendLimitExceeded {
		t.Fatalf("expected ErrSpendLimitExceeded, got %v", err)
	}
}

func TestSpendLicense_FanOutSpend(t *testing.T) {
	sl := NewSpendLicense(800, "badge-456")

	// Fan-out within limit
	if err := sl.FanOutSpend(300); err != nil {
		t.Fatalf("unexpected error on fan-out spend: %v", err)
	}

	// Fan-out exceeding limit
	if err := sl.FanOutSpend(600); err != ErrSpendLimitExceeded {
		t.Fatalf("expected ErrSpendLimitExceeded on fan-out, got %v", err)
	}
}

func TestSpendLicense_AcceptSpend(t *testing.T) {
	sl := NewSpendLicense(800, "badge-789")

	if err := sl.ReserveSpend(700); err != nil {
		t.Fatalf("unexpected error reserving spend: %v", err)
	}

	receipt := sl.AcceptSpend()
	if receipt.BadgeID != "badge-789" {
		t.Errorf("expected badge ID 'badge-789', got %s", receipt.BadgeID)
	}
	if receipt.Amount != 700 {
		t.Errorf("expected amount 700, got %d", receipt.Amount)
	}
}
