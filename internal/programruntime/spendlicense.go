package programruntime

import (
	"errors"
	"sync"
)

// ErrSpendLimitExceeded is returned when spend license limit is exceeded.
var ErrSpendLimitExceeded = errors.New("spend license limit exceeded")

// SpendLicense tracks the spend license for a program runtime.
type SpendLicense struct {
	mu       sync.Mutex
	limit    int64 // monthly spend limit in cents
	used     int64 // spend used so far in cents
	badgeID  string
	accepted bool
}

// NewSpendLicense creates a new SpendLicense with the given limit and badge ID.
func NewSpendLicense(limit int64, badgeID string) *SpendLicense {
	return &SpendLicense{
		limit:   limit,
		badgeID: badgeID,
	}
}

// BadgeID returns the ID badge associated with this spend license.
func (s *SpendLicense) BadgeID() string {
	return s.badgeID
}

// ReserveSpend attempts to reserve spend amount cents.
// Returns error if limit exceeded.
func (s *SpendLicense) ReserveSpend(amount int64) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.used+amount > s.limit {
		return ErrSpendLimitExceeded
	}
	s.used += amount
	return nil
}

// FanOutSpend attempts to fan-out spend amount cents.
// Fan-out is treated same as reserve for spend accounting.
func (s *SpendLicense) FanOutSpend(amount int64) error {
	return s.ReserveSpend(amount)
}

// AcceptSpend marks the spend as accepted and generates a ShipReceipt.
func (s *SpendLicense) AcceptSpend() *ShipReceipt {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.accepted = true
	return &ShipReceipt{
		BadgeID: s.badgeID,
		Amount:  s.used,
	}
}

// ShipReceipt represents a receipt generated after accepting spend.
type ShipReceipt struct {
	BadgeID string
	Amount  int64
}
