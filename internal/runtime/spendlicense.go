package runtime

import (
	"errors"
	"sync"
	"time"
)

// SpendLicenseManager manages spend licenses for program runtime executions.
type SpendLicenseManager struct {
	mu            sync.Mutex
	monthlyBudget int64 // in cents
	usedThisMonth int64 // in cents
	reservations  map[string]*SpendReservation
}

// SpendReservation represents a reserved spend license.
type SpendReservation struct {
	ID        string
	Amount    int64 // in cents
	CreatedAt time.Time
	Used      bool
}

// NewSpendLicenseManager creates a new SpendLicenseManager with the given monthly budget (in cents).
func NewSpendLicenseManager(monthlyBudget int64) *SpendLicenseManager {
	return &SpendLicenseManager{
		monthlyBudget: monthlyBudget,
		reservations:  make(map[string]*SpendReservation),
	}
}

// Reserve attempts to reserve a spend license for the given amount (in cents).
// Returns a reservation ID or error if budget exceeded.
func (m *SpendLicenseManager) Reserve(id string, amount int64) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if amount <= 0 {
		return errors.New("amount must be positive")
	}

	if m.usedThisMonth+amount > m.monthlyBudget {
		return errors.New("monthly spend budget exceeded")
	}

	if _, exists := m.reservations[id]; exists {
		return errors.New("reservation ID already exists")
	}

	m.reservations[id] = &SpendReservation{
		ID:        id,
		Amount:    amount,
		CreatedAt: time.Now(),
		Used:      false,
	}
	m.usedThisMonth += amount
	return nil
}

// Use marks a reservation as used and returns an error if not found or already used.
func (m *SpendLicenseManager) Use(id string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	r, exists := m.reservations[id]
	if !exists {
		return errors.New("reservation not found")
	}
	if r.Used {
		return errors.New("reservation already used")
	}
	r.Used = true
	return nil
}

// Release releases a reservation, freeing up the reserved amount.
func (m *SpendLicenseManager) Release(id string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	r, exists := m.reservations[id]
	if !exists {
		return errors.New("reservation not found")
	}
	if !r.Used {
		m.usedThisMonth -= r.Amount
	}
	delete(m.reservations, id)
	return nil
}

// ResetMonthlyUsage resets the monthly usage counter. Should be called once per month.
func (m *SpendLicenseManager) ResetMonthlyUsage() {
	m.mu.Lock()
	defer m.mu.Unlock()

	m.usedThisMonth = 0
	m.reservations = make(map[string]*SpendReservation)
}
