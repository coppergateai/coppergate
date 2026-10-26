package programruntime

import (
	"errors"
	"sync"
)

// LandingManager manages landing and writeback of runtime operations.
type LandingManager struct {
	mu        sync.Mutex
	landedIDs map[string]bool
}

// NewLandingManager creates a new LandingManager.
func NewLandingManager() *LandingManager {
	return &LandingManager{
		landedIDs: make(map[string]bool),
	}
}

// Land marks the runtime operation as landed and performs writeback.
func (lm *LandingManager) Land(badge IDBadge) error {
	if err := badge.Validate(); err != nil {
		return err
	}

	lm.mu.Lock()
	defer lm.mu.Unlock()

	if lm.landedIDs[badge.ID] {
		return errors.New("operation already landed")
	}

	// Simulate writeback logic here (e.g., update DB, logs)
	lm.landedIDs[badge.ID] = true
	return nil
}

// IsLanded checks if the operation has landed.
func (lm *LandingManager) IsLanded(badge IDBadge) bool {
	lm.mu.Lock()
	defer lm.mu.Unlock()
	return lm.landedIDs[badge.ID]
}
