package runtime

import (
	"testing"
)

func TestSpendLicenseReserveAndRelease(t *testing.T) {
	programID := "test-program"
	amount := int64(500) // $5.00

	// Reset usage for test isolation
	usageMu.Lock()
	programSpendUsage[programID] = 0
	usageMu.Unlock()

	sl := NewSpendLicense(programID, amount)
	err := sl.Reserve()
	if err != nil {
		t.Fatalf("Reserve failed unexpectedly: %v", err)
	}

	usageMu.Lock()
	usage := programSpendUsage[programID]
	usageMu.Unlock()
	if usage != amount {
		t.Errorf("Expected usage %d, got %d", amount, usage)
	}

	// Reserving more than envelope should fail
	sl2 := NewSpendLicense(programID, monthlyEnvelopeCents)
	err = sl2.Reserve()
	if err != ErrInsufficientFunds {
		t.Errorf("Expected ErrInsufficientFunds, got %v", err)
	}

	sl.Release()
	usageMu.Lock()
	usage = programSpendUsage[programID]
	usageMu.Unlock()
	if usage != 0 {
		t.Errorf("Expected usage 0 after release, got %d", usage)
	}
}
