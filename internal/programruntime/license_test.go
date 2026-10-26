package programruntime

import (
	"testing"
	"time"
)

func TestReserveLicense(t *testing.T) {
	lm := NewLicenseManager()

	// Reserve within envelope
	id, err := lm.ReserveLicense("program1", 5)
	if err != nil {
		t.Fatalf("unexpected error reserving license: %v", err)
	}
	if id == "" {
		t.Fatal("expected license ID")
	}

	// Reserve exceeding envelope
	_, err = lm.ReserveLicense("program1", 4)
	if err == nil {
		t.Fatal("expected error exceeding monthly spend envelope")
	}
}

func TestFanOutLicense(t *testing.T) {
	lm := NewLicenseManager()
	id, err := lm.ReserveLicense("program1", 3)
	if err != nil {
		t.Fatalf("reserve error: %v", err)
	}

	err = lm.FanOutLicense(id, "agent1")
	if err != nil {
		t.Fatalf("fan-out error: %v", err)
	}

	// Fan-out again should fail
	err = lm.FanOutLicense(id, "agent2")
	if err == nil {
		t.Fatal("expected error on double allocation")
	}
}

func TestIssueBadge(t *testing.T) {
	lm := NewLicenseManager()
	id, err := lm.ReserveLicense("program1", 2)
	if err != nil {
		t.Fatalf("reserve error: %v", err)
	}

	// Cannot issue badge before fan-out
	_, err = lm.IssueBadge("agent1", id)
	if err == nil {
		t.Fatal("expected error issuing badge before allocation")
	}

	err = lm.FanOutLicense(id, "agent1")
	if err != nil {
		t.Fatalf("fan-out error: %v", err)
	}

	badgeID, err := lm.IssueBadge("agent1", id)
	if err != nil {
		t.Fatalf("issue badge error: %v", err)
	}
	if badgeID == "" {
		t.Fatal("expected badge ID")
	}
}

func TestAcceptLicense(t *testing.T) {
	lm := NewLicenseManager()
	id, err := lm.ReserveLicense("program1", 1)
	if err != nil {
		t.Fatalf("reserve error: %v", err)
	}
	err = lm.FanOutLicense(id, "agent1")
	if err != nil {
		t.Fatalf("fan-out error: %v", err)
	}
	badgeID, err := lm.IssueBadge("agent1", id)
	if err != nil {
		t.Fatalf("issue badge error: %v", err)
	}

	receiptID, err := lm.AcceptLicense(badgeID)
	if err != nil {
		t.Fatalf("accept license error: %v", err)
	}
	if receiptID == "" {
		t.Fatal("expected ship receipt ID")
	}

	// Badge should be invalid after acceptance
	lm.mu.Lock()
	badge := lm.badges[badgeID]
	lm.mu.Unlock()
	if badge.Valid {
		t.Fatal("expected badge to be invalid after acceptance")
	}

	// Accepting again should fail
	_, err = lm.AcceptLicense(badgeID)
	if err == nil {
		t.Fatal("expected error accepting with invalid badge")
	}
}

func TestConcurrentReserve(t *testing.T) {
	lm := NewLicenseManager()
	done := make(chan bool)
	for i := 0; i < 10; i++ {
		go func() {
			_, _ = lm.ReserveLicense("program1", 1)
			done <- true
		}()
	}
	for i := 0; i < 10; i++ {
		<-done
	}
	// Total spend should not exceed envelope
	if lm.monthlySpend > MonthlySpendEnvelope {
		t.Fatalf("monthly spend exceeded envelope: %v", lm.monthlySpend)
	}
}

func TestGenerateIDFormat(t *testing.T) {
	id := generateID("test")
	if len(id) == 0 {
		t.Fatal("expected non-empty ID")
	}
	if id[:5] != "test-" {
		t.Fatalf("expected prefix 'test-', got %s", id[:5])
	}
}
