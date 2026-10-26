package programruntime

import (
	"testing"
)

func TestLicenseManager(t *testing.T) {
	lm := NewLicenseManager(800) // $8.00 in cents
	if lm.Remaining() != 800 {
		t.Errorf("expected remaining 800, got %d", lm.Remaining())
	}
	err := lm.ReserveSpend(500)
	if err != nil {
		t.Fatalf("unexpected error reserving spend: %v", err)
	}
	if lm.Used() != 500 {
		t.Errorf("expected used 500, got %d", lm.Used())
	}
	if lm.Remaining() != 300 {
		t.Errorf("expected remaining 300, got %d", lm.Remaining())
	}
	err = lm.ReserveSpend(400)
	if err == nil {
		t.Errorf("expected error reserving spend exceeding limit")
	}
	lm.ReleaseSpend(200)
	if lm.Used() != 300 {
		t.Errorf("expected used 300 after release, got %d", lm.Used())
	}
}

func TestBadgeManager(t *testing.T) {
	bm := NewBadgeManager()
	badge, err := bm.IssueBadge("badge1", "user1")
	if err != nil {
		t.Fatalf("unexpected error issuing badge: %v", err)
	}
	if !bm.ValidateBadge(badge.ID) {
		t.Errorf("badge should be valid")
	}
	err = bm.RevokeBadge(badge.ID)
	if err != nil {
		t.Fatalf("unexpected error revoking badge: %v", err)
	}
	if bm.ValidateBadge(badge.ID) {
		t.Errorf("badge should be invalid after revoke")
	}
}

func TestRuntimeManagerWorkflow(t *testing.T) {
	lm := NewLicenseManager(800)
	bm := NewBadgeManager()
	rm := NewRuntimeManager(lm, bm)

	_, err := bm.IssueBadge("badge1", "user1")
	if err != nil {
		t.Fatalf("issue badge error: %v", err)
	}

	op, err := rm.CreateOperation("op1", "badge1", 500)
	if err != nil {
		t.Fatalf("create operation error: %v", err)
	}
	if op.State != StatePending {
		t.Errorf("expected state Pending, got %s", op.State)
	}

	err = rm.AcceptOperation("op1")
	if err != nil {
		t.Fatalf("accept operation error: %v", err)
	}
	op, _ = rm.GetOperation("op1")
	if op.State != StateAccepted {
		t.Errorf("expected state Accept, got %s", op.State)
	}
	if lm.Used() != 500 {
		t.Errorf("expected license used 500, got %d", lm.Used())
	}

	err = rm.ShipReceiptOperation("op1")
	if err != nil {
		t.Fatalf("ship receipt operation error: %v", err)
	}
	op, _ = rm.GetOperation("op1")
	if op.State != StateShipReceipt {
		t.Errorf("expected state ShipReceipt, got %s", op.State)
	}
	if !op.processed {
		t.Errorf("expected operation processed true")
	}
}

func TestInvalidBadgeOperation(t *testing.T) {
	lm := NewLicenseManager(800)
	bm := NewBadgeManager()
	rm := NewRuntimeManager(lm, bm)

	_, err := rm.CreateOperation("op1", "invalid-badge", 100)
	if err == nil {
		t.Errorf("expected error for invalid badge")
	}
}

func TestSpendLimitExceeded(t *testing.T) {
	lm := NewLicenseManager(800)
	bm := NewBadgeManager()
	rm := NewRuntimeManager(lm, bm)

	_, err := bm.IssueBadge("badge1", "user1")
	if err != nil {
		t.Fatalf("issue badge error: %v", err)
	}

	op, err := rm.CreateOperation("op1", "badge1", 900)
	if err != nil {
		t.Fatalf("create operation error: %v", err)
	}

	err = rm.AcceptOperation("op1")
	if err == nil {
		t.Errorf("expected error accepting operation exceeding spend limit")
	}
}
