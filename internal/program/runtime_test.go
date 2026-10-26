package program

import (
	"testing"
)

func TestReserveSpend(t *testing.T) {
	rt := NewRuntime()

	if err := rt.ReserveSpend(5); err != nil {
		t.Fatalf("unexpected error reserving spend: %v", err)
	}

	if reserved := rt.GetReserved(); reserved != 5 {
		t.Fatalf("expected reserved 5, got %d", reserved)
	}

	// Reserve exceeding envelope
	if err := rt.ReserveSpend(4); err == nil {
		t.Fatalf("expected error reserving beyond envelope")
	}

	// Reserve zero or negative
	if err := rt.ReserveSpend(0); err == nil {
		t.Fatalf("expected error reserving zero amount")
	}
	if err := rt.ReserveSpend(-1); err == nil {
		t.Fatalf("expected error reserving negative amount")
	}
}

func TestFanOutSpend(t *testing.T) {
	rt := NewRuntime()
	if err := rt.ReserveSpend(6); err != nil {
		t.Fatalf("reserve failed: %v", err)
	}

	badge, err := rt.FanOutSpend("agent1", 3)
	if err != nil {
		t.Fatalf("fan-out failed: %v", err)
	}
	if badge.AgentID != "agent1" || badge.Amount != 3 {
		t.Fatalf("unexpected badge data: %+v", badge)
	}

	// Fan-out exceeding reserved
	if _, err := rt.FanOutSpend("agent2", 4); err == nil {
		t.Fatalf("expected error fan-out exceeding reserved")
	}

	// Fan-out zero or negative
	if _, err := rt.FanOutSpend("agent3", 0); err == nil {
		t.Fatalf("expected error fan-out zero amount")
	}
	if _, err := rt.FanOutSpend("agent3", -1); err == nil {
		t.Fatalf("expected error fan-out negative amount")
	}
}

func TestAcceptSpend(t *testing.T) {
	rt := NewRuntime()
	if err := rt.ReserveSpend(5); err != nil {
		t.Fatalf("reserve failed: %v", err)
	}

	_, err := rt.FanOutSpend("agent1", 5)
	if err != nil {
		t.Fatalf("fan-out failed: %v", err)
	}

	receipt, err := rt.AcceptSpend("agent1")
	if err != nil {
		t.Fatalf("accept spend failed: %v", err)
	}
	if receipt.AgentID != "agent1" || receipt.Amount != 5 {
		t.Fatalf("unexpected receipt data: %+v", receipt)
	}

	// Accept again should fail
	if _, err := rt.AcceptSpend("agent1"); err == nil {
		t.Fatalf("expected error on double accept")
	}

	// Accept without badge
	if _, err := rt.AcceptSpend("agent2"); err == nil {
		t.Fatalf("expected error accepting without badge")
	}
}

func TestGetShipReceipt(t *testing.T) {
	rt := NewRuntime()
	if err := rt.ReserveSpend(3); err != nil {
		t.Fatalf("reserve failed: %v", err)
	}
	_, err := rt.FanOutSpend("agent1", 3)
	if err != nil {
		t.Fatalf("fan-out failed: %v", err)
	}
	_, err = rt.AcceptSpend("agent1")
	if err != nil {
		t.Fatalf("accept failed: %v", err)
	}

	receipt, ok := rt.GetShipReceipt("agent1")
	if !ok {
		t.Fatalf("expected receipt for agent1")
	}
	if receipt.AgentID != "agent1" || receipt.Amount != 3 {
		t.Fatalf("unexpected receipt data: %+v", receipt)
	}

	_, ok = rt.GetShipReceipt("agent2")
	if ok {
		t.Fatalf("did not expect receipt for agent2")
	}
}
