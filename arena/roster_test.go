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
	}{
		{
			name: "Full arena allowed with sufficient budget",
			cfg: RosterConfig{
				BudgetCents: 800,
				MicroCost:   3.0,
				EngineerOnly: false,
			},
			wantType: FullArena,
			wantErr:  false,
		},
		{
			name: "Lean roster under $2 micro cost and engineer only with tight budget",
			cfg: RosterConfig{
				BudgetCents: 700,
				MicroCost:   1.99,
				EngineerOnly: true,
			},
			wantType: LeanRoster,
			wantErr:  false,
		},
		{
			name: "Error on tight budget but micro cost too high",
			cfg: RosterConfig{
				BudgetCents: 700,
				MicroCost:   2.01,
				EngineerOnly: true,
			},
			wantErr: true,
		},
		{
			name: "Error on tight budget but engineer only false",
			cfg: RosterConfig{
				BudgetCents: 700,
				MicroCost:   1.50,
				EngineerOnly: false,
			},
			wantErr: true,
		},
		{
			name: "Full arena allowed with exactly $8 budget",
			cfg: RosterConfig{
				BudgetCents: 800,
				MicroCost:   1.50,
				EngineerOnly: true,
			},
			wantType: FullArena,
			wantErr:  false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			r, err := SpawnRoster(tt.cfg)
			if (err != nil) != tt.wantErr {
				t.Fatalf("SpawnRoster() error = %v, wantErr %v", err, tt.wantErr)
			}
			if err == nil && r.Type != tt.wantType {
				t.Errorf("SpawnRoster() got type = %v, want %v", r.Type, tt.wantType)
			}
		})
	}
}

func TestRosterManager_GetOrSpawnRoster(t *testing.T) {
	cfg := RosterConfig{
		BudgetCents: 700,
		MicroCost:   1.5,
		EngineerOnly: true,
	}
	rm := NewRosterManager(cfg)

	r1, err := rm.GetOrSpawnRoster()
	if err != nil {
		t.Fatalf("GetOrSpawnRoster() error = %v", err)
	}
	if r1.Type != LeanRoster {
		t.Errorf("Expected LeanRoster, got %v", r1.Type)
	}

	r2, err := rm.GetOrSpawnRoster()
	if err != nil {
		t.Fatalf("GetOrSpawnRoster() second call error = %v", err)
	}
	if r2 != r1 {
		t.Errorf("Expected same roster instance on second call")
	}
}
