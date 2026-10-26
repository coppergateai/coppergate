package programruntime

import (
	"errors"
	"fmt"
	"sync"
	"time"
)

// SpendLicense represents a license to spend program runtime resources.
type SpendLicense struct {
	ID           string    // Unique ID badge for the license
	Reserved     int64     // Reserved spend amount in cents
	Used         int64     // Used spend amount in cents
	Envelope     int64     // Monthly spend envelope in cents
	CreatedAt    time.Time // Creation timestamp
	Accepted     bool      // Whether the license has been accepted
	ShipReceipt  *ShipReceipt
	mu           sync.Mutex
}

// ShipReceipt is proof of spend acceptance.
type ShipReceipt struct {
	LicenseID string
	Timestamp time.Time
	Amount    int64
}

// NewSpendLicense creates a new spend license with a given envelope and reserved amount.
func NewSpendLicense(id string, envelope int64, reserve int64) (*SpendLicense, error) {
	if reserve > envelope {
		return nil, fmt.Errorf("reserve %d exceeds envelope %d", reserve, envelope)
	}
	return &SpendLicense{
		ID:        id,
		Reserved:  reserve,
		Envelope:  envelope,
		CreatedAt: time.Now(),
	}, nil
}

// FanOut reserves a portion of the license to a new sub-license with a new ID badge.
func (sl *SpendLicense) FanOut(newID string, amount int64) (*SpendLicense, error) {
	sl.mu.Lock()
	defer sl.mu.Unlock()

	if sl.Used+amount > sl.Reserved {
		return nil, errors.New("insufficient reserved spend to fan out")
	}
	sl.Used += amount

	subLicense := &SpendLicense{
		ID:        newID,
		Reserved:  amount,
		Envelope:  sl.Envelope,
		CreatedAt: time.Now(),
	}
	return subLicense, nil
}

// Accept marks the license as accepted and generates a ship receipt.
func (sl *SpendLicense) Accept() (*ShipReceipt, error) {
	sl.mu.Lock()
	defer sl.mu.Unlock()

	if sl.Accepted {
		return nil, errors.New("license already accepted")
	}
	sl.Accepted = true
	sl.ShipReceipt = &ShipReceipt{
		LicenseID: sl.ID,
		Timestamp: time.Now(),
		Amount:    sl.Reserved,
	}
	return sl.ShipReceipt, nil
}

// LandingWriteback simulates landing and writing back the license state.
func (sl *SpendLicense) LandingWriteback() error {
	sl.mu.Lock()
	defer sl.mu.Unlock()

	// In a real system, this would persist state to a DB or ledger.
	// Here we simulate by printing/logging.
	fmt.Printf("LandingWriteback: LicenseID=%s Reserved=%d Used=%d Accepted=%v\n",
		sl.ID, sl.Reserved, sl.Used, sl.Accepted)
	return nil
}
