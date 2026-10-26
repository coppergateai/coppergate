package runtime

import (
	"errors"
	"sync"
)

// SpendLicense represents a contracted autonomy spend license with a monthly envelope.
type SpendLicense struct {
	MonthlyEnvelope int64 // in cents
	Used            int64 // amount used in current period
	mu              sync.Mutex
}

// NewSpendLicense creates a new SpendLicense with the given monthly envelope.
func NewSpendLicense(monthlyEnvelope int64) *SpendLicense {
	return &SpendLicense{
		MonthlyEnvelope: monthlyEnvelope,
		Used:            0,
	}
}

// Reserve attempts to reserve an amount from the spend license.
// Returns an error if the reservation exceeds the monthly envelope.
func (sl *SpendLicense) Reserve(amount int64) error {
	sl.mu.Lock()
	defer sl.mu.Unlock()

	if amount <= 0 {
		return errors.New("reserve amount must be positive")
	}

	if sl.Used+amount > sl.MonthlyEnvelope {
		return errors.New("spend license exceeded")
	}

	sl.Used += amount
	return nil
}

// Release releases a previously reserved amount back to the spend license.
func (sl *SpendLicense) Release(amount int64) error {
	sl.mu.Lock()
	defer sl.mu.Unlock()

	if amount <= 0 {
		return errors.New("release amount must be positive")
	}

	if amount > sl.Used {
		return errors.New("release amount exceeds used amount")
	}

	sl.Used -= amount
	return nil
}

// Reset resets the used amount for a new monthly period.
func (sl *SpendLicense) Reset() {
	sl.mu.Lock()
	defer sl.mu.Unlock()
	sl.Used = 0
}
