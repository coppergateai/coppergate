package program

import (
	"testing"
	"time"
)

func TestReserveSpend(t *testing.T) {
	mgr := NewRuntimeSpendManager()
	programID := "prog1"

	err := mgr.ReserveSpend(programID, 500)
	if err != nil {
		t.Fatalf("ReserveSpend failed: %v", err)
	}

	// Reserve more than envelope should fail
	err = mgr.ReserveSpend(programID, 400)
	if err == nil {
		t.Fatalf("ReserveSpend should fail when exceeding envelope")
	}
}

func TestFanOutSpend(t *testing.T) {
	mgr := NewRuntimeSpendManager()
	parentID := "parent"
	childID := "child"

	err := mgr.ReserveSpend(parentID, 600)
	if err != nil {
		t.Fatalf("ReserveSpend failed: %v", err)
	}

	err = mgr.FanOutSpend(parentID, childID, 300)
	if err != nil {
		t.Fatalf("FanOutSpend failed: %v", err)
	}

	// Fan-out more than available should fail
	err = mgr.FanOutSpend(parentID, childID, 400)
	if err == nil {
		t.Fatalf("FanOutSpend should fail when exceeding available")
	}
}

func TestIssueBadge(t *testing.T) {
	mgr := NewRuntimeSpendManager()
	programID := "prog2"

	err := mgr.ReserveSpend(programID, 100)
	if err != nil {
		t.Fatalf("ReserveSpend failed: %v", err)
	}

	badge, err := mgr.IssueBadge(programID)
	if err != nil {
		t.Fatalf("IssueBadge failed: %v", err)
	}

	if badge.BadgeID == "" || badge.Signature == "" {
		t.Fatalf("Badge fields empty")
	}

	if badge.ExpiresAt.Sub(badge.IssuedAt) != BadgeValidityDuration {
		t.Fatalf("Badge validity duration mismatch")
	}
}

func TestAcceptLicense(t *testing.T) {
	mgr := NewRuntimeSpendManager()
	programID := "prog3"

	err := mgr.ReserveSpend(programID, 200)
	if err != nil {
		t.Fatalf("ReserveSpend failed: %v", err)
	}

	receipt, err := mgr.AcceptLicense(programID)
	if err != nil {
		t.Fatalf("AcceptLicense failed: %v", err)
	}

	if receipt.ProgramID != programID {
		t.Fatalf("Receipt ProgramID mismatch")
	}

	// Accepting again should fail
	_, err = mgr.AcceptLicense(programID)
	if err == nil {
		t.Fatalf("AcceptLicense should fail if already accepted")
	}
}

func TestConcurrentReserve(t *testing.T) {
	mgr := NewRuntimeSpendManager()
	programID := "concurrent"

	done := make(chan bool)
	for i := 0; i < 10; i++ {
		go func() {
			_ = mgr.ReserveSpend(programID, 1)
			done <- true
		}()
	}

	for i := 0; i < 10; i++ {
		<-done
	}

	mgr.mu.Lock()
	license := mgr.licenses[programID]
	mgr.mu.Unlock()

	if license.ReservedCents > MonthlySpendEnvelopeCents {
		t.Fatalf("Reserved spend exceeds envelope")
	}
}

func TestBadgeSignatureUniqueness(t *testing.T) {
	mgr := NewRuntimeSpendManager()
	programID := "prog4"

	err := mgr.ReserveSpend(programID, 100)
	if err != nil {
		t.Fatalf("ReserveSpend failed: %v", err)
	}

	badge1, err := mgr.IssueBadge(programID)
	if err != nil {
		t.Fatalf("IssueBadge failed: %v", err)
	}

	time.Sleep(10 * time.Millisecond) // ensure different timestamp

	badge2, err := mgr.IssueBadge(programID)
	if err != nil {
		t.Fatalf("IssueBadge failed: %v", err)
	}

	if badge1.Signature == badge2.Signature {
		t.Fatalf("Badge signatures should be unique")
	}
}
