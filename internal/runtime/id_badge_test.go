package runtime

import (
	"testing"
	"time"
)

func TestIDBadgeIssueValidateRevoke(t *testing.T) {
	participantID := "participant-123"
	badge := IssueIDBadge(participantID)

	if badge.ID == "" {
		t.Fatal("Expected badge ID to be non-empty")
	}

	if !badge.IsValid() {
		t.Error("Expected badge to be valid immediately after issuance")
	}

	if !ValidateBadge(badge.ID) {
		t.Error("ValidateBadge returned false for valid badge")
	}

	badge.Revoke()
	if badge.IsValid() {
		t.Error("Expected badge to be invalid after revocation")
	}

	if ValidateBadge(badge.ID) {
		t.Error("ValidateBadge returned true for revoked badge")
	}
}

func TestIDBadgeExpiration(t *testing.T) {
	badge := IssueIDBadge("participant-expire")
	badge.mu.Lock()
	badge.issuedAt = time.Now().Add(-25 * time.Hour)
	badge.mu.Unlock()

	if badge.IsValid() {
		t.Error("Expected badge to be invalid after expiration time")
	}
}
