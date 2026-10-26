package programruntime

import (
	"errors"
	"sync"
)

// LicenseManager manages contracted autonomy spend licenses.
type LicenseManager struct {
	mu           sync.Mutex
	monthlyLimit int64 // in cents, e.g. 800 for $8.00
	used         int64
}

// NewLicenseManager creates a new LicenseManager with a monthly spend limit.
func NewLicenseManager(monthlyLimitCents int64) *LicenseManager {
	return &LicenseManager{
		monthlyLimit: monthlyLimitCents,
		used:         0,
	}
}

// ReserveSpend attempts to reserve spend license for an operation.
// Returns error if limit exceeded.
func (lm *LicenseManager) ReserveSpend(amount int64) error {
	lm.mu.Lock()
	defer lm.mu.Unlock()
	if amount <= 0 {
		return errors.New("reserve amount must be positive")
	}
	if lm.used+amount > lm.monthlyLimit {
		return errors.New("license spend limit exceeded")
	}
	lm.used += amount
	return nil
}

// ReleaseSpend releases previously reserved spend license.
func (lm *LicenseManager) ReleaseSpend(amount int64) {
	lm.mu.Lock()
	defer lm.mu.Unlock()
	if amount <= 0 {
		return
	}
	if amount > lm.used {
		lm.used = 0
	} else {
		lm.used -= amount
	}
}

// Used returns the amount of spend license used.
func (lm *LicenseManager) Used() int64 {
	lm.mu.Lock()
	defer lm.mu.Unlock()
	return lm.used
}

// Remaining returns the remaining spend license available.
func (lm *LicenseManager) Remaining() int64 {
	lm.mu.Lock()
	defer lm.mu.Unlock()
	return lm.monthlyLimit - lm.used
}
