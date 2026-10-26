package runtime

import (
	"testing"
	"time"
)

func TestProgramLicense_ReserveLicense(t *testing.T) {
	pl := NewProgramLicense("prog1")

	err := pl.ReserveLicense(5)
	if err != nil {
		t.Fatalf("unexpected error reserving license: %v", err)
	}

	if pl.ReservedAmount != 5 {
		t.Errorf("expected reserved amount 5, got %.2f", pl.ReservedAmount)
	}

	err = pl.ReserveLicense(4)
	if err == nil {
		t.Errorf("expected error reserving over monthly cap")
	}
}

func TestProgramLicense_FanOutLicense(t *testing.T) {
	pl := NewProgramLicense("prog1")
	pl.ReserveLicense(6)

	badge, err := pl.FanOutLicense("comp1", 3)
	if err != nil {
		t.Fatalf("unexpected error fanning out license: %v", err)
	}
	if badge.ComponentID != "comp1" || badge.Amount != 3 {
		t.Errorf("unexpected badge data: %+v", badge)
	}

	_, err = pl.FanOutLicense("comp1", 1)
	if err == nil {
		t.Errorf("expected error for duplicate badge")
	}

	_, err = pl.FanOutLicense("comp2", 4)
	if err == nil {
		t.Errorf("expected error for fan-out exceeding reserved amount")
	}
}

func TestProgramLicense_AcceptContract(t *testing.T) {
	pl := NewProgramLicense("prog1")
	pl.ReserveLicense(7)
	pl.FanOutLicense("comp1", 5)

	// Override nowUnix for deterministic timestamp
	nowUnix = func() int64 { return 1234567890 }
	defer func() { nowUnix = func() int64 { return 0 } }()

	receipt, err := pl.AcceptContract("comp1")
	if err != nil {
		t.Fatalf("unexpected error accepting contract: %v", err)
	}
	if receipt.ComponentID != "comp1" || receipt.Amount != 5 || receipt.Timestamp != 1234567890 {
		t.Errorf("unexpected receipt data: %+v", receipt)
	}

	// Badge should be removed after acceptance
	_, exists := pl.Badges["comp1"]
	if exists {
		t.Errorf("badge not removed after acceptance")
	}

	// FannedOutAmount should be reduced
	if pl.FannedOutAmount != 0 {
		t.Errorf("expected fanned out amount 0, got %.2f", pl.FannedOutAmount)
	}

	// Accepting again should error
	_, err = pl.AcceptContract("comp1")
	if err == nil {
		t.Errorf("expected error accepting contract without badge")
	}
}
