package program

import (
	"testing"
	"time"
)

func TestReserveSpend(t *testing.T) {
	rt := NewRuntime("prog1")

	// Reserve within envelope
	if err := rt.ReserveSpend(5); err != nil {
		t.Fatalf("unexpected error reserving spend: %v", err)
	}

	// Reserve exceeding envelope
	if err := rt.ReserveSpend(4); err == nil {
		t.Fatalf("expected error when exceeding spend envelope")
	}

	// Reserve zero or negative amount
	if err := rt.ReserveSpend(0); err == nil {
		t.Fatalf("expected error for zero amount")
	}
	if err := rt.ReserveSpend(-1); err == nil {
		t.Fatalf("expected error for negative amount")
	}
}

func TestSpendResetAfterMonth(t *testing.T) {
	rt := NewRuntime("prog2")

	if err := rt.ReserveSpend(8); err != nil {
		t.Fatalf("unexpected error reserving spend: %v", err)
	}

	// Simulate time passing > 30 days
	rt.mu.Lock()
	rt.lastReset = rt.lastReset.Add(-31 * 24 * time.Hour)
	rt.mu.Unlock()

	// Should reset spend and allow new reservation
	if err := rt.ReserveSpend(8); err != nil {
		t.Fatalf("expected spend reset, got error: %v", err)
	}
}

func TestBadgeLifecycle(t *testing.T) {
	rt := NewRuntime("prog3")

	badge, err := rt.IssueBadge("badge1", time.Minute)
	if err != nil {
		t.Fatalf("failed to issue badge: %v", err)
	}

	if !rt.ValidateBadge("badge1") {
		t.Fatalf("badge should be valid immediately after issuance")
	}

	// Duplicate badge ID
	if _, err := rt.IssueBadge("badge1", time.Minute); err == nil {
		t.Fatalf("expected error issuing duplicate badge ID")
	}

	// Empty badge ID
	if _, err := rt.IssueBadge("", time.Minute); err == nil {
		t.Fatalf("expected error issuing empty badge ID")
	}

	// Revoke badge
	if err := rt.RevokeBadge("badge1"); err != nil {
		t.Fatalf("failed to revoke badge: %v", err)
	}

	if rt.ValidateBadge("badge1") {
		t.Fatalf("revoked badge should not be valid")
	}

	// Revoke non-existent badge
	if err := rt.RevokeBadge("nonexistent"); err == nil {
		t.Fatalf("expected error revoking non-existent badge")
	}

	// Revoke already revoked badge
	if err := rt.RevokeBadge("badge1"); err == nil {
		t.Fatalf("expected error revoking already revoked badge")
	}
}

func TestBadgeExpiration(t *testing.T) {
	rt := NewRuntime("prog4")

	badge, err := rt.IssueBadge("badge2", time.Millisecond*10)
	if err != nil {
		t.Fatalf("failed to issue badge: %v", err)
	}

	time.Sleep(20 * time.Millisecond)

	if rt.ValidateBadge(badge.ID) {
		t.Fatalf("badge should be expired")
	}
}

func TestAcceptActionAndReceipts(t *testing.T) {
	rt := NewRuntime("prog5")

	receipt := rt.AcceptAction("Accepted contract #123")
	if receipt.ProgramID != "prog5" {
		t.Fatalf("receipt ProgramID mismatch")
	}
	if receipt.Details != "Accepted contract #123" {
		t.Fatalf("receipt Details mismatch")
	}

	receipts := rt.GetReceipts()
	if len(receipts) != 1 {
		t.Fatalf("expected 1 receipt, got %d", len(receipts))
	}
	if receipts[0].Details != "Accepted contract #123" {
		t.Fatalf("receipt Details mismatch in GetReceipts")
	}
}
