package arena

import (
	"testing"
)

func TestSpawnRoster(t *testing.T) {
	tests := []struct {
		name       string
		cfg        RosterConfig
		wantType   RosterType
		wantErr    bool
		wantMicros int
	}{
		{
			name: "Lean roster under $2 for Engineer",
			cfg: RosterConfig{
				MonthlyBudgetUSD: 1.99,
				Role:             "Engineer",
			},
			wantType:   LeanRoster,
			wantErr:    false,
			wantMicros: 2,
		},
		{
			name: "Lean roster under $2 for Reviewer",
			cfg: RosterConfig{
				MonthlyBudgetUSD: 1.5,
				Role:             "Reviewer",
			},
			wantType:   LeanRoster,
			wantErr:    false,
			wantMicros: 2,
		},
		{
			name: "Lean roster under $2 for other role disallowed",
			cfg: RosterConfig{
				MonthlyBudgetUSD: 1.5,
				Role:             "Manager",
			},
			wantErr: true,
		},
		{
			name: "Full arena roster at $2 budget for Engineer",
			cfg: RosterConfig{
				MonthlyBudgetUSD: 2.0,
				Role:             "Engineer",
			},
			wantType:   FullArena,
			wantErr:    false,
			wantMicros: 8,
		},
		{
			name: "Full arena roster capped at $8 budget",
			cfg: RosterConfig{
				MonthlyBudgetUSD: 20.0,
				Role:             "Engineer",
			},
			wantType:   FullArena,
			wantErr:    false,
			wantMicros: 8,
		},
		{
			name: "Invalid negative budget",
			cfg: RosterConfig{
				MonthlyBudgetUSD: -1,
				Role:             "Engineer",
			},
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			r, err := SpawnRoster(tt.cfg)
			if (err != nil) != tt.wantErr {
				t.Fatalf("SpawnRoster() error = %v, wantErr %v", err, tt.wantErr)
			}
			if err != nil {
				return
			}
			if r.Type != tt.wantType {
				t.Errorf("SpawnRoster() roster type = %v, want %v", r.Type, tt.wantType)
			}
			if len(r.Micros) != tt.wantMicros {
				t.Errorf("SpawnRoster() micros count = %d, want %d", len(r.Micros), tt.wantMicros)
			}
		})
	}
}

func TestRosterManager_GetOrSpawnRoster(t *testing.T) {
	rm := NewRosterManager()
	cfg := RosterConfig{
		MonthlyBudgetUSD: 1.5,
		Role:             "Engineer",
	}

	r1, err := rm.GetOrSpawnRoster(cfg)
	if err != nil {
		t.Fatalf("GetOrSpawnRoster() error = %v", err)
	}
	if r1.Type != LeanRoster {
		t.Errorf("Expected lean roster, got %v", r1.Type)
	}

	// Call again should return same roster instance
	r2, err := rm.GetOrSpawnRoster(cfg)
	if err != nil {
		t.Fatalf("GetOrSpawnRoster() error = %v", err)
	}
	if r1 != r2 {
		t.Errorf("Expected same roster instance on second call")
	}
}
