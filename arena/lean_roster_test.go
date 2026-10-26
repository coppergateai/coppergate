package arena

import (
	"testing"
)

func TestLeanRosterAllocations(t *testing.T) {
	tests := []struct {
		name        string
		mode        ArenaMode
		budgetCents int
		role        Role
		size        int
		wantErr     bool
	}{
		{
			name:        "LeanRoster Engineer under budget",
			mode:        LeanRosterMode,
			budgetCents: 150,
			role:        RoleEngineer,
			size:        512 * 1024,
			wantErr:     false,
		},
		{
			name:        "LeanRoster Reviewer under budget",
			mode:        LeanRosterMode,
			budgetCents: 100,
			role:        RoleReviewer,
			size:        256 * 1024,
			wantErr:     false,
		},
		{
			name:        "LeanRoster FullArenaSpawn role disallowed",
			mode:        LeanRosterMode,
			budgetCents: 100,
			role:        RoleFullArenaSpawn,
			size:        128 * 1024,
			wantErr:     true,
		},
		{
			name:        "LeanRoster Engineer over budget disallowed",
			mode:        LeanRosterMode,
			budgetCents: 250,
			role:        RoleEngineer,
			size:        128 * 1024,
			wantErr:     true,
		},
		{
			name:        "LeanRoster allocation exceeding max size disallowed",
			mode:        LeanRosterMode,
			budgetCents: 100,
			role:        RoleEngineer,
			size:        2 * 1024 * 1024, // 2MB > maxSize 1MB
			wantErr:     true,
		},
		{
			name:        "FullArenaMode no restrictions",
			mode:        FullArenaMode,
			budgetCents: 500,
			role:        RoleFullArenaSpawn,
			size:        2 * 1024 * 1024,
			wantErr:     false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			a := NewArena(tt.mode, tt.budgetCents, tt.role)
			buf, err := a.Alloc(tt.size)
			if (err != nil) != tt.wantErr {
				t.Fatalf("Alloc() error = %v, wantErr %v", err, tt.wantErr)
			}
			if err == nil && len(buf) != tt.size {
				t.Errorf("Alloc() returned buffer size %d, want %d", len(buf), tt.size)
			}
		})
	}
}

func TestUsedTracking(t *testing.T) {
	a := NewArena(LeanRosterMode, 100, RoleEngineer)
	sizes := []int{100, 200, 300}
	total := 0
	for _, sz := range sizes {
		_, err := a.Alloc(sz)
		if err != nil {
			t.Fatalf("Alloc() unexpected error: %v", err)
		}
		total += sz
	}
	if used := a.Used(); used != total {
		t.Errorf("Used() = %d, want %d", used, total)
	}
}
