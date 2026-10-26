package program

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestReserveSpend(t *testing.T) {
	rsm := NewRuntimeSpendManager()

	err := rsm.ReserveSpend("license1", 5)
	if err != nil {
		t.Fatalf("unexpected error reserving spend: %v", err)
	}

	// Reserving more than envelope should fail
	err = rsm.ReserveSpend("license2", 4)
	if err == nil || !strings.Contains(err.Error(), "exceeds monthly envelope") {
		t.Fatalf("expected envelope exceed error, got: %v", err)
	}

	// Reserving with duplicate ID should fail
	err = rsm.ReserveSpend("license1", 1)
	if err == nil || !strings.Contains(err.Error(), "already exists") {
		t.Fatalf("expected duplicate ID error, got: %v", err)
	}
}

func TestFanOutSpend(t *testing.T) {
	rsm := NewRuntimeSpendManager()
	err := rsm.ReserveSpend("parent", 6)
	if err != nil {
		t.Fatalf("reserve failed: %v", err)
	}

	// Fan-out valid amount
	err = rsm.FanOutSpend("parent", "child1", "arena", 3)
	if err != nil {
		t.Fatalf("fan-out failed: %v", err)
	}

	// Fan-out more than parent amount should fail
	err = rsm.FanOutSpend("parent", "child2", "arena", 4)
	if err == nil || !strings.Contains(err.Error(), "invalid fan-out amount") {
		t.Fatalf("expected invalid fan-out amount error, got: %v", err)
	}

	// Fan-out from non-existent parent should fail
	err = rsm.FanOutSpend("nonexistent", "child3", "arena", 1)
	if err == nil || !strings.Contains(err.Error(), "not found") {
		t.Fatalf("expected parent not found error, got: %v", err)
	}

	// Fan-out with duplicate ID should fail
	err = rsm.FanOutSpend("parent", "child1", "arena", 1)
	if err == nil || !strings.Contains(err.Error(), "already exists") {
		t.Fatalf("expected duplicate ID error, got: %v", err)
	}
}

func TestAcceptSpend(t *testing.T) {
	rsm := NewRuntimeSpendManager()
	err := rsm.ReserveSpend("parent", 5)
	if err != nil {
		t.Fatalf("reserve failed: %v", err)
	}
	err = rsm.FanOutSpend("parent", "child1", "arena", 3)
	if err != nil {
		t.Fatalf("fan-out failed: %v", err)
	}

	license := rsm.licenses["child1"]
	if license.BadgeID == "" {
		t.Fatal("expected badge ID to be set")
	}

	receipt, err := rsm.AcceptSpend(license.BadgeID)
	if err != nil {
		t.Fatalf("accept spend failed: %v", err)
	}
	if receipt == "" {
		t.Fatal("expected non-empty ship receipt")
	}

	// Accepting again should fail
	_, err = rsm.AcceptSpend(license.BadgeID)
	if err == nil || !strings.Contains(err.Error(), "already accepted") {
		t.Fatalf("expected already accepted error, got: %v", err)
	}

	// Accepting with invalid badge should fail
	_, err = rsm.AcceptSpend("invalid-badge")
	if err == nil || !strings.Contains(err.Error(), "not found") {
		t.Fatalf("expected badge not found error, got: %v", err)
	}
}

func TestGetSpendLicenseState(t *testing.T) {
	rsm := NewRuntimeSpendManager()
	err := rsm.ReserveSpend("license1", 2)
	if err != nil {
		t.Fatalf("reserve failed: %v", err)
	}
	stateJSON, err := rsm.GetSpendLicenseState()
	if err != nil {
		t.Fatalf("get state failed: %v", err)
	}
	var licenses map[string]SpendLicense
	err = json.Unmarshal(stateJSON, &licenses)
	if err != nil {
		t.Fatalf("unmarshal failed: %v", err)
	}
	if len(licenses) != 1 {
		t.Fatalf("expected 1 license, got %d", len(licenses))
	}
}
