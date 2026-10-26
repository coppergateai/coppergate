package programruntime

import (
	"testing"
	"time"
)

func TestSpendLicenseManager_ReserveAccept(t *testing.T) {
	manager := NewSpendLicenseManager(800) // $8.00 envelope

	validBadge := IDBadge{ProgramID: "prog1", Valid: true}
	invalidBadge := IDBadge{ProgramID: "prog1", Valid: false}

	// Invalid badge should fail
	if err := manager.Reserve(invalidBadge, 100); err == nil {
		t.Fatal("expected error for invalid badge")
	}

	// Negative or zero amount should fail
	if err := manager.Reserve(validBadge, 0); err == nil {
		t.Fatal("expected error for zero amount")
	}
	if err := manager.Reserve(validBadge, -10); err == nil {
		t.Fatal("expected error for negative amount")
	}

	// Reserve 300 cents
	if err := manager.Reserve(validBadge, 300); err != nil {
		t.Fatalf("unexpected error reserving 300 cents: %v", err)
	}
	if used := manager.GetUsed(); used != 300 {
		t.Fatalf("expected used 300, got %d", used)
	}

	// Reserve 500 cents (total 800)
	if err := manager.Reserve(validBadge, 500); err != nil {
		t.Fatalf("unexpected error reserving 500 cents: %v", err)
	}
	if used := manager.GetUsed(); used != 800 {
		t.Fatalf("expected used 800, got %d", used)
	}

	// Reserve 1 cent more should fail
	if err := manager.Reserve(validBadge, 1); err == nil {
		t.Fatal("expected error for exceeding envelope")
	}

	// Accept receipt for 300 cents
	receipt, err := manager.Accept(validBadge, 300)
	if err != nil {
		t.Fatalf("unexpected error accepting spend: %v", err)
	}
	if receipt.ProgramID != validBadge.ProgramID {
		t.Fatalf("receipt ProgramID mismatch: got %s, want %s", receipt.ProgramID, validBadge.ProgramID)
	}
	if receipt.AmountCents != 300 {
		t.Fatalf("receipt amount mismatch: got %d, want 300", receipt.AmountCents)
	}
	if receipt.ReceiptID == "" {
		t.Fatal("receipt ID should not be empty")
	}

	// Accept with invalid badge should fail
	if _, err := manager.Accept(invalidBadge, 100); err == nil {
		t.Fatal("expected error accepting with invalid badge")
	}
}

func TestSpendLicenseManager_ResetIfNeeded(t *testing.T) {
	manager := NewSpendLicenseManager(800)
	badge := IDBadge{ProgramID: "prog1", Valid: true}

	// Reserve some amount
	if err := manager.Reserve(badge, 400); err != nil {
		t.Fatalf("reserve failed: %v", err)
	}
	if used := manager.GetUsed(); used != 400 {
		t.Fatalf("expected used 400, got %d", used)
	}

	// Simulate month change by setting lastReset to previous month
	manager.mu.Lock()
	manager.lastReset = manager.lastReset.AddDate(0, -1, 0)
	manager.mu.Unlock()

	// Next Reserve should reset usage
	if err := manager.Reserve(badge, 500); err != nil {
		t.Fatalf("reserve failed after month reset: %v", err)
	}
	if used := manager.GetUsed(); used != 500 {
		t.Fatalf("expected used 500 after reset, got %d", used)
	}
}
