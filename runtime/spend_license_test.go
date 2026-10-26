package runtime

import "testing"

func TestSpendLicenseReserveRelease(t *testing.T) {
	sl := NewSpendLicense(800) // $8.00 in cents

	if err := sl.Reserve(500); err != nil {
		t.Fatalf("unexpected error reserving 500: %v", err)
	}

	if sl.Used != 500 {
		t.Errorf("expected Used=500, got %d", sl.Used)
	}

	if err := sl.Reserve(400); err == nil {
		t.Errorf("expected error reserving 400 exceeding envelope")
	}

	if err := sl.Release(200); err != nil {
		t.Fatalf("unexpected error releasing 200: %v", err)
	}

	if sl.Used != 300 {
		t.Errorf("expected Used=300 after release, got %d", sl.Used)
	}

	if err := sl.Release(400); err == nil {
		t.Errorf("expected error releasing more than used")
	}

	sl.Reset()
	if sl.Used != 0 {
		t.Errorf("expected Used=0 after reset, got %d", sl.Used)
	}
}
