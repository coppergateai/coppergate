package runtime

import (
	"testing"
)

func TestSpendLicenseReserveRelease(t *testing.T) {
	sl := NewSpendLicense(8.0)

	// Reserve 5.0 should succeed
	if err := sl.Reserve(5.0); err != nil {
		t.Fatalf("Reserve failed: %v", err)
	}
	if sl.Reserved != 5.0 {
		t.Fatalf("Reserved amount incorrect, got %v want 5.0", sl.Reserved)
	}

	// Reserve 4.0 should fail (exceeds envelope)
	if err := sl.Reserve(4.0); err == nil {
		t.Fatal("Reserve should have failed due to envelope exceeded")
	}

	// Release 3.0 should succeed
	if err := sl.Release(3.0); err != nil {
		t.Fatalf("Release failed: %v", err)
	}
	if sl.Reserved != 2.0 {
		t.Fatalf("Reserved amount incorrect after release, got %v want 2.0", sl.Reserved)
	}

	// Release 3.0 should fail (exceeds reserved)
	if err := sl.Release(3.0); err == nil {
		t.Fatal("Release should have failed due to exceeding reserved amount")
	}
}

func TestIDBadge(t *testing.T) {
	badge := NewIDBadge("program-123")
	if !badge.Valid {
		t.Fatal("New badge should be valid")
	}
	if badge.ProgramID != "program-123" {
		t.Fatalf("Badge ProgramID incorrect, got %v want program-123", badge.ProgramID)
	}
	badge.Invalidate()
	if badge.Valid {
		t.Fatal("Badge should be invalid after Invalidate()")
	}
}

func TestAcceptSpendLicense(t *testing.T) {
	sl := NewSpendLicense(8.0)
	if err := sl.Reserve(6.0); err != nil {
		t.Fatalf("Reserve failed: %v", err)
	}

	receipt, err := AcceptSpendLicense("program-abc", sl, 5.0)
	if err != nil {
		t.Fatalf("AcceptSpendLicense failed: %v", err)
	}
	if !receipt.Accepted {
		t.Fatal("Receipt should be accepted")
	}
	if receipt.Amount != 5.0 {
		t.Fatalf("Receipt amount incorrect, got %v want 5.0", receipt.Amount)
	}
	if sl.Reserved != 1.0 {
		t.Fatalf("Reserved amount after accept incorrect, got %v want 1.0", sl.Reserved)
	}

	// Accept more than reserved should fail
	_, err = AcceptSpendLicense("program-abc", sl, 2.0)
	if err == nil {
		t.Fatal("AcceptSpendLicense should have failed due to amount exceeding reserved")
	}
}
