package programruntime

import (
	"errors"
	"sync"
)

// SpendLicense manages the spend license for contracted autonomy operations.
type SpendLicense struct {
	mu          sync.Mutex
	monthlyCap  int64 // in cents
	usedThisMonth int64
}

// NewSpendLicense creates a new SpendLicense with the given monthly cap.
func NewSpendLicense(monthlyCap int64) *SpendLicense {
	return &SpendLicense{
		monthlyCap: monthlyCap,
	}
}

// Reserve attempts to reserve the given amount from the spend license.
// Returns an ID badge if successful, or an error if insufficient funds.
func (sl *SpendLicense) Reserve(amount int64) (IDBadge, error) {
	sl.mu.Lock()
	defer sl.mu.Unlock()

	if amount <= 0 {
		return IDBadge{}, errors.New("amount must be positive")
	}

	if sl.usedThisMonth+amount > sl.monthlyCap {
		return IDBadge{}, errors.New("insufficient spend license available")
	}

	sl.usedThisMonth += amount
	badge := NewIDBadge()
	return badge, nil
}

// Release returns the reserved amount back to the spend license.
func (sl *SpendLicense) Release(amount int64) {
	sl.mu.Lock()
	defer sl.mu.Unlock()

	if amount <= 0 {
		return
	}

	sl.usedThisMonth -= amount
	if sl.usedThisMonth < 0 {
		sl.usedThisMonth = 0
	}
}

// Used returns the amount used this month.
func (sl *SpendLicense) Used() int64 {
	sl.mu.Lock()
	defer sl.mu.Unlock()
	return sl.usedThisMonth
}

// MonthlyCap returns the monthly spend cap.
func (sl *SpendLicense) MonthlyCap() int64 {
	return sl.monthlyCap
}
