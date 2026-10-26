package program

import (
	"testing"
	"time"
)

func TestReserveSpend(t *testing.T) {
	rt := NewRuntime()

	err := rt.ReserveSpend(5)
	if err != nil {
		t.Fatalf("unexpected error reserving spend: %v", err)
	}

	err = rt.ReserveSpend(4)
	if err == nil {
		t.Fatalf("expected error reserving over envelope, got none")
	}
}

func TestFanOutSpend(t *testing.T) {
	rt := NewRuntime()

	err := rt.ReserveSpend(5)
	if err != nil {
		t.Fatalf("reserve failed: %v", err)
	}

	err = rt.FanOutSpend(3)
	if err != nil {
		t.Fatalf("fan-out failed: %v", err)
	}

	err = rt.FanOutSpend(3)
	if err == nil {
		t.Fatalf("expected fan-out over reserved to fail, got none")
	}
}

func TestIssueBadge(t *testing.T) {
	rt := NewRuntime()

	badge, err := rt.IssueBadge("user123")
	if err != nil {
		t.Fatalf("issue badge failed: %v", err)
	}
	if badge.Entity != "user123" {
		t.Errorf("badge entity mismatch: got %s", badge.Entity)
	}
	if badge.ExpiresAt.Before(time.Now()) {
		t.Errorf("badge expiry is in the past")
	}

	_, err = rt.IssueBadge("")
	if err == nil {
		t.Errorf("expected error issuing badge with empty entity")
	}
}

func TestAcceptOutput(t *testing.T) {
	rt := NewRuntime()

	receipt, err := rt.AcceptOutput("prog1", 2.5, "task completed")
	if err != nil {
		t.Fatalf("accept output failed: %v", err)
	}
	if receipt.ProgramID != "prog1" {
		t.Errorf("receipt programID mismatch: got %s", receipt.ProgramID)
	}
	if receipt.Amount != 2.5 {
		t.Errorf("receipt amount mismatch: got %f", receipt.Amount)
	}

	_, err = rt.AcceptOutput("", 1, "details")
	if err == nil {
		t.Errorf("expected error with empty programID")
	}

	_, err = rt.AcceptOutput("prog2", 0, "details")
	if err == nil {
		t.Errorf("expected error with zero amount")
	}
}
