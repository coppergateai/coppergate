package programruntime

import (
	"testing"
	"time"
)

func TestSpendLicenseReserveAndFanOut(t *testing.T) {
	pr := NewProgramRuntime()

	// Reserve $5.00 (500 cents)
	err := pr.ReserveSpend(500)
	if err != nil {
		t.Fatalf("unexpected error reserving spend: %v", err)
	}

	// Reserve $4.00 (400 cents) should fail (total 900 > 800)
	err = pr.ReserveSpend(400)
	if err == nil {
		t.Fatalf("expected error reserving spend exceeding envelope, got none")
	}

	// Fan out $3.00 (300 cents)
	err = pr.FanOutSpend(300)
	if err != nil {
		t.Fatalf("unexpected error fanning out spend: %v", err)
	}

	// Fan out $300 again should fail (only 200 reserved left)
	err = pr.FanOutSpend(300)
	if err == nil {
		t.Fatalf("expected error fanning out more than reserved, got none")
	}
}

func TestIDBadgeIssueAndValidate(t *testing.T) {
	pr := NewProgramRuntime()

	badge := pr.IssueIDBadge("user123", time.Second*1)
	if badge == nil {
		t.Fatalf("expected badge, got nil")
	}

	if !pr.ValidateIDBadge("user123") {
		t.Fatalf("expected badge to be valid immediately after issue")
	}

	time.Sleep(time.Second * 2)

	if pr.ValidateIDBadge("user123") {
		t.Fatalf("expected badge to be invalid after expiration")
	}
}

func TestAcceptAndShipReceipt(t *testing.T) {
	pr := NewProgramRuntime()

	itemID := "item42"

	// ShipReceipt without accept should fail
	err := pr.ShipReceipt(itemID)
	if err == nil {
		t.Fatalf("expected error shipping unaccepted item, got none")
	}

	pr.Accept(itemID)

	err = pr.ShipReceipt(itemID)
	if err != nil {
		t.Fatalf("unexpected error shipping accepted item: %v", err)
	}

	if !pr.IsShipped(itemID) {
		t.Fatalf("expected item to be marked as shipped")
	}
}
