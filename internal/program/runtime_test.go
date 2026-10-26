package program

import (
	"context"
	"testing"
	"time"
)

func TestReserveSpendLicense(t *testing.T) {
	pr := NewProgramRuntime("prog1")
	ctx := context.Background()

	// Reserve within envelope
	if err := pr.ReserveSpendLicense(ctx, 500); err != nil {
		t.Fatalf("unexpected error reserving spend: %v", err)
	}

	// Reserve exceeding envelope
	if err := pr.ReserveSpendLicense(ctx, 400); err != ErrSpendLimitExceeded {
		t.Fatalf("expected ErrSpendLimitExceeded, got %v", err)
	}

	// Simulate new month resets reservation
	pr.monthStart = time.Now().Add(-31 * 24 * time.Hour)
	if err := pr.ReserveSpendLicense(ctx, 800); err != nil {
		t.Fatalf("unexpected error reserving spend after month reset: %v", err)
	}
}

func TestIDBadgeIssueAndValidate(t *testing.T) {
	pr := NewProgramRuntime("prog2")
	ctx := context.Background()

	badge := pr.IssueIDBadge(ctx)
	if badge == nil {
		t.Fatal("expected badge, got nil")
	}

	// Validate correct badge
	if err := pr.ValidateIDBadge(badge.Token); err != nil {
		t.Fatalf("unexpected error validating badge: %v", err)
	}

	// Validate wrong token
	if err := pr.ValidateIDBadge("wrong-token"); err != ErrInvalidBadge {
		t.Fatalf("expected ErrInvalidBadge for wrong token, got %v", err)
	}

	// Expire badge and validate
	pr.badge.ExpiresAt = time.Now().Add(-time.Minute)
	if err := pr.ValidateIDBadge(badge.Token); err != ErrInvalidBadge {
		t.Fatalf("expected ErrInvalidBadge for expired badge, got %v", err)
	}
}

func TestAcceptContractAndShipReceipt(t *testing.T) {
	pr := NewProgramRuntime("prog3")
	ctx := context.Background()

	badge := pr.IssueIDBadge(ctx)

	// Accept contract with valid badge
	receipt, err := pr.AcceptContract(ctx, badge.Token)
	if err != nil {
		t.Fatalf("unexpected error accepting contract: %v", err)
	}
	if receipt == nil {
		t.Fatal("expected ship receipt, got nil")
	}

	// Accept contract again should fail
	_, err = pr.AcceptContract(ctx, badge.Token)
	if err == nil {
		t.Fatal("expected error accepting contract twice, got nil")
	}

	// Get ship receipt
	gotReceipt, err := pr.GetShipReceipt()
	if err != nil {
		t.Fatalf("unexpected error getting ship receipt: %v", err)
	}
	if gotReceipt != receipt {
		t.Fatal("ship receipt mismatch")
	}
}

func TestAcceptContractInvalidBadge(t *testing.T) {
	pr := NewProgramRuntime("prog4")
	ctx := context.Background()

	pr.IssueIDBadge(ctx)

	_, err := pr.AcceptContract(ctx, "invalid-token")
	if err != ErrInvalidBadge {
		t.Fatalf("expected ErrInvalidBadge, got %v", err)
	}
}
