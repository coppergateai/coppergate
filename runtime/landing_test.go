package runtime

import "testing"

func TestLandingAndWriteback(t *testing.T) {
	rl := NewRuntimeLanding()

	sl := NewSpendLicense(800)
	badge, err := NewIDBadge()
	if err != nil {
		t.Fatalf("failed to create badge: %v", err)
	}

	rc := &RuntimeContract{
		ID:           "contract1",
		SpendLicense: sl,
		Badge:        badge,
		State:        StatePending,
	}

	if err := rl.Land(rc); err != nil {
		t.Fatalf("land failed: %v", err)
	}

	if len(rl.contracts) != 1 {
		t.Errorf("expected 1 contract landed, got %d", len(rl.contracts))
	}

	if err := rl.Writeback(); err != nil {
		t.Fatalf("writeback failed: %v", err)
	}

	if len(rl.contracts) != 0 {
		t.Errorf("expected 0 contracts after writeback, got %d", len(rl.contracts))
	}
}
