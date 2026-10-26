package programruntime

import (
	"testing"
)

func TestLicenseReserveAcceptFlow(t *testing.T) {
	lm := NewLicenseManager()

	// Reserve a license for $3
	license, err := lm.Reserve(3)
	if err != nil {
		t.Fatalf("Reserve failed: %v", err)
	}
	if license.Amount != 3 {
		t.Errorf("Expected amount 3, got %d", license.Amount)
	}
	if license.Accepted {
		t.Errorf("License should not be accepted initially")
	}

	// Accept the license
	receipt, err := lm.Accept(license.IDBadge)
	if err != nil {
		t.Fatalf("Accept failed: %v", err)
	}
	if receipt == "" {
		t.Errorf("Expected non-empty ship receipt")
	}

	// Accepting again should fail
	_, err = lm.Accept(license.IDBadge)
	if err == nil {
		t.Errorf("Expected error on double accept")
	}

	// Writeback should succeed
	err = lm.Writeback(license.IDBadge)
	if err != nil {
		t.Errorf("Writeback failed: %v", err)
	}
}

func TestReserveExceedEnvelope(t *testing.T) {
	lm := NewLicenseManager()

	// Reserve $5
	_, err := lm.Reserve(5)
	if err != nil {
		t.Fatalf("Reserve failed: %v", err)
	}

	// Reserve $4 should fail (5 + 4 > 8)
	_, err = lm.Reserve(4)
	if err == nil {
		t.Errorf("Expected error reserving beyond envelope")
	}

	// Reserve $3 should succeed (5 + 3 = 8)
	_, err = lm.Reserve(3)
	if err != nil {
		t.Errorf("Reserve failed unexpectedly: %v", err)
	}
}

func TestGetLicense(t *testing.T) {
	lm := NewLicenseManager()
	license, err := lm.Reserve(2)
	if err != nil {
		t.Fatalf("Reserve failed: %v", err)
	}

	got, ok := lm.GetLicense(license.IDBadge)
	if !ok {
		t.Errorf("Expected license to be found")
	}
	if got.IDBadge != license.IDBadge {
		t.Errorf("Mismatched IDBadge")
	}

	_, ok = lm.GetLicense("non-existent")
	if ok {
		t.Errorf("Expected license not found for invalid ID")
	}
}
