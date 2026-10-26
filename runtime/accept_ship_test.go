package runtime

import "testing"

func TestAcceptAndShipReceipt(t *testing.T) {
	sl := NewSpendLicense(800)
	badge, err := NewIDBadge()
	if err != nil {
		t.Fatalf("failed to create badge: %v", err)
	}

	rc := &RuntimeContract{
		ID:           "contract1",
		SpendLicense: sl,
		Badge:        badge,
		State:        StatePending,
	}

	if err := rc.Accept(); err != nil {
		t.Fatalf("accept failed: %v", err)
	}

	if rc.State != StateAccepted {
		t.Errorf("expected state accepted, got %v", rc.State)
	}

	receipt, err := rc.ShipReceipt(500)
	if err != nil {
		t.Fatalf("ship receipt failed: %v", err)
	}

	if receipt.Amount != 500 {
		t.Errorf("expected receipt amount 500, got %d", receipt.Amount)
	}

	if rc.State != StateShipped {
		t.Errorf("expected state shipped, got %v", rc.State)
	}

	// Try shipping again should fail
	_, err = rc.ShipReceipt(100)
	if err == nil {
		t.Errorf("expected error shipping after shipped state")
	}
}
