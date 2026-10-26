package arena

import (
	"errors"
	"sync"
)

// RosterType defines the type of roster allocation.
type RosterType int

const (
	// FullArena spawns a full arena roster.
	FullArena RosterType = iota
	// LeanRoster spawns a lean roster with micros under $2.
	LeanRoster
)

// ErrBudgetExceeded is returned when the budget is insufficient for the requested roster.
var ErrBudgetExceeded = errors.New("budget exceeded for requested roster")

// MemberRole defines the role of a roster member.
type MemberRole string

const (
	Engineer MemberRole = "Engineer"
	Reviewer MemberRole = "Reviewer"
)

// Member represents a roster member.
type Member struct {
	Name  string
	Role  MemberRole
	Micro float64 // Cost in dollars
}

// Roster represents a team roster.
type Roster struct {
	Members []Member
	Type    RosterType
}

// SpawnRoster spawns a roster based on the requested type and budget.
// For LeanRoster, only members with micros under $2 and roles Engineer or Reviewer are included.
// FullArena is disallowed under tight budget (<= $8).
func SpawnRoster(requested RosterType, budget float64) (*Roster, error) {
	if requested == FullArena && budget <= 8 {
		return nil, ErrBudgetExceeded
	}

	// Simulated full arena members (for example)
	fullArenaMembers := []Member{
		{"Alice", Engineer, 3.5},
		{"Bob", Reviewer, 2.5},
		{"Charlie", Engineer, 4.0},
		{"Diana", Reviewer, 3.0},
	}

	// Simulated lean roster members (micros under $2, Engineer or Reviewer only)
	leanMembers := []Member{
		{"Eve", Engineer, 1.5},
		{"Frank", Reviewer, 1.8},
		{"Grace", Engineer, 1.9},
	}

	switch requested {
	case LeanRoster:
		totalCost := 0.0
		for _, m := range leanMembers {
			totalCost += m.Micro
		}
		if totalCost > budget {
			return nil, ErrBudgetExceeded
		}
		return &Roster{
			Members: leanMembers,
			Type:    LeanRoster,
		}, nil
	case FullArena:
		totalCost := 0.0
		for _, m := range fullArenaMembers {
			totalCost += m.Micro
		}
		if totalCost > budget {
			return nil, ErrBudgetExceeded
		}
		return &Roster{
			Members: fullArenaMembers,
			Type:    FullArena,
		}, nil
	default:
		return nil, errors.New("unknown roster type")
	}
}

// RosterManager manages roster spawning with concurrency safety.
type RosterManager struct {
	mu      sync.Mutex
	budget  float64
	roster  *Roster
	rosterT RosterType
}

// NewRosterManager creates a new RosterManager with given budget.
func NewRosterManager(budget float64) *RosterManager {
	return &RosterManager{
		budget: budget,
	}
}

// GetRoster returns the current roster or spawns a new one if none exists.
func (rm *RosterManager) GetRoster(requested RosterType) (*Roster, error) {
	rm.mu.Lock()
	defer rm.mu.Unlock()

	if rm.roster != nil && rm.rosterT == requested {
		return rm.roster, nil
	}

	r, err := SpawnRoster(requested, rm.budget)
	if err != nil {
		return nil, err
	}

	rm.roster = r
	rm.rosterT = requested
	return r, nil
}
