package runtime

import "testing"

func TestIDBadgeGenerationAndValidation(t *testing.T) {
	badge, err := NewIDBadge()
	if err != nil {
		t.Fatalf("failed to generate ID badge: %v", err)
	}

	if badge.ID == "" {
		t.Fatal("badge ID is empty")
	}

	if !Validate(badge.ID) {
		t.Errorf("badge ID %s should be valid", badge.ID)
	}

	if Validate("invalid-id") {
		t.Errorf("invalid badge ID should not validate")
	}
}
