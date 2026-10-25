package lease

import (
	"context"
	"testing"
	"time"
)

func TestLeasePauseRenewHonesty(t *testing.T) {
	renewPeriod := 100 * time.Millisecond
	lease := NewLease(renewPeriod, true)

	// Initial state should be active
	if lease.State() != LeaseActive {
		t.Fatalf("expected active lease state")
	}

	// Pause the lease
	lease.Pause()
	if lease.State() != LeasePaused {
		t.Fatalf("expected paused lease state")
	}

	// Wait for longer than renewPeriod to simulate mid-flight CI quiet while paused
	time.Sleep(150 * time.Millisecond)

	// Renew while paused should be quiet and keep lease honest (no expiry)
	err := lease.Renew(context.Background())
	if err != nil {
		t.Fatalf("renew while paused should not error, got %v", err)
	}

	// Lease should still be paused and not expired
	if lease.State() != LeasePaused {
		t.Fatalf("expected paused lease state after renew")
	}
	if lease.IsExpired() {
		t.Fatalf("lease should not be expired while paused")
	}

	// Resume lease, expiry should be extended by pause duration
	lease.Resume()
	if lease.State() != LeaseActive {
		t.Fatalf("expected active lease state after resume")
	}

	// Renew should succeed normally
	err = lease.Renew(context.Background())
	if err != nil {
		t.Fatalf("renew after resume should succeed, got %v", err)
	}

	// Wait for lease to expire
	time.Sleep(renewPeriod + 10*time.Millisecond)

	// Renew after expiry with fail-closed should error
	err = lease.Renew(context.Background())
	if err == nil {
		t.Fatalf("expected error renewing expired lease with fail-closed")
	}

	// Create lease with failClosed = false
	lease2 := NewLease(renewPeriod, false)
	time.Sleep(renewPeriod + 10*time.Millisecond)
	err = lease2.Renew(context.Background())
	if err != nil {
		t.Fatalf("expected renew to recover expired lease without fail-closed, got %v", err)
	}
	if lease2.State() != LeaseActive {
		t.Fatalf("expected lease to be active after renew recovery")
	}
}
