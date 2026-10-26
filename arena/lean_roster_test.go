package arena

import (
	"testing"
)

func TestNewArena_LeanRoster(t *testing.T) {
	tests := []struct {
		name           string
		availableMicros int64
		role           Role
		wantLean       bool
		wantErr        bool
	}{
		{
			name:           "Lean roster for Engineer under $2",
			availableMicros: 1_500_000,
			role:           RoleEngineer,
			wantLean:       true,
		},
		{
			name:           "Lean roster for Reviewer under $2",
			availableMicros: 1_999_999,
			role:           RoleReviewer,
			wantLean:       true,
		},
		{
			name:           "No lean roster for Engineer at $2",
			availableMicros: 2_000_000,
			role:           RoleEngineer,
			wantLean:       false,
		},
		{
			name:           "No lean roster for Other role under $2",
			availableMicros: 1_000_000,
			role:           RoleOther,
			wantLean:       false,
		},
		{
			name:           "Error when monthly envelope exceeds $8",
			availableMicros: 1_000_000,
			role:           RoleEngineer,
			wantErr:        true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			cfg := Config{
				AvailableMicros: tt.availableMicros,
				Role:           tt.role,
				MonthlyEnvelope: 8_000_000,
			}
			if tt.wantErr {
				cfg.MonthlyEnvelope = 9_000_000
			}
			a, err := NewArena(cfg)
			if (err != nil) != tt.wantErr {
				t.Fatalf("NewArena() error = %v, wantErr %v", err, tt.wantErr)
			}
			if err != nil {
				return
			}
			if got := a.IsLean(); got != tt.wantLean {
				t.Errorf("IsLean() = %v, want %v", got, tt.wantLean)
			}
		})
	}
}

func TestArena_AllocateAndAllocations(t *testing.T) {
	cfg := Config{
		AvailableMicros: 1_000_000,
		Role:           RoleEngineer,
		MonthlyEnvelope: 8_000_000,
	}
	a, err := NewArena(cfg)
	if err != nil {
		t.Fatalf("NewArena() error = %v", err)
	}
	if !a.IsLean() {
		t.Errorf("Expected lean roster but got non-lean")
	}
	for i := 0; i < 5; i++ {
		a.Allocate()
	}
	if got := a.Allocations(); got != 5 {
		t.Errorf("Allocations() = %d, want 5", got)
	}
}
