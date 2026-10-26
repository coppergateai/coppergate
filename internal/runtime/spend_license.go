package runtime

import (
	"errors"
	"sync"
)

// ErrInsufficientFunds is returned when spend license reservation fails due to insufficient funds.
var ErrInsufficientFunds = errors.New("insufficient funds to reserve spend license")

// SpendLicense manages spend licenses for program runtime operations.
type SpendLicense struct {
	programID string
	amount    int64 // amount in cents
	mu        sync.Mutex
	reserved  bool
}

var (
	// monthlyEnvelopeCents is the spend cap per program per month.
	monthlyEnvelopeCents int64 = 800 // $8.00 in cents

	// programSpendUsage tracks current spend usage per programID.
	programSpendUsage = make(map[string]int64)
	usageMu          sync.Mutex
)

// NewSpendLicense creates a new SpendLicense for a program with the specified amount.
func NewSpendLicense(programID string, amount int64) *SpendLicense {
	return &SpendLicense{
		programID: programID,
		amount:    amount,
	}
}

// Reserve attempts to reserve the spend license amount for the program.
// Returns ErrInsufficientFunds if the reservation would exceed the monthly envelope.
func (sl *SpendLicense) Reserve() error {
	usageMu.Lock()
	defer usageMu.Unlock()

	currentUsage := programSpendUsage[sl.programID]
	if currentUsage+sl.amount > monthlyEnvelopeCents {
		return ErrInsufficientFunds
	}

	programSpendUsage[sl.programID] = currentUsage + sl.amount

	sl.mu.Lock()
	sl.reserved = true
	sl.mu.Unlock()

	return nil
}

// Release releases a previously reserved spend license amount.
func (sl *SpendLicense) Release() {
	sl.mu.Lock()
	defer sl.mu.Unlock()
	if !sl.reserved {
		return
	}

	usageMu.Lock()
	defer usageMu.Unlock()

	currentUsage := programSpendUsage[sl.programID]
	if currentUsage >= sl.amount {
		programSpendUsage[sl.programID] = currentUsage - sl.amount
	}
	sl.reserved = false
}
