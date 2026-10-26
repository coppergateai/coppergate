package runtime

import (
	"errors"
	"sync"
)

// SpendLicense represents a reserved spend license for program runtime.
type SpendLicense struct {
	ID       string  // Unique license ID
	Amount   float64 // Amount reserved in dollars
	Consumed float64 // Amount consumed so far
}

// LicenseManager manages spend licenses with reserve and fan-out capabilities.
type LicenseManager struct {
	mu            sync.Mutex
	monthlyEnvelope float64
	licenses      map[string]*SpendLicense
}

// NewLicenseManager creates a new LicenseManager with a monthly envelope cap.
func NewLicenseManager(monthlyEnvelope float64) *LicenseManager {
	return &LicenseManager{
		monthlyEnvelope: monthlyEnvelope,
		licenses:      make(map[string]*SpendLicense),
	}
}

// ReserveLicense reserves a spend license with the given ID and amount.
// Returns error if reservation exceeds monthly envelope or ID exists.
func (lm *LicenseManager) ReserveLicense(id string, amount float64) error {
	lm.mu.Lock()
	defer lm.mu.Unlock()

	if amount <= 0 {
		return errors.New("amount must be positive")
	}

	if _, exists := lm.licenses[id]; exists {
		return errors.New("license ID already exists")
	}

	totalReserved := 0.0
	for _, lic := range lm.licenses {
		totalReserved += lic.Amount
	}
	if totalReserved+amount > lm.monthlyEnvelope {
		return errors.New("reservation exceeds monthly envelope")
	}

	lm.licenses[id] = &SpendLicense{
		ID:     id,
		Amount: amount,
	}
	return nil
}

// FanOutLicense fans out a portion of an existing license to a new license ID.
// Returns error if parent license does not exist or insufficient amount.
func (lm *LicenseManager) FanOutLicense(parentID, childID string, amount float64) error {
	lm.mu.Lock()
	defer lm.mu.Unlock()

	parent, exists := lm.licenses[parentID]
	if !exists {
		return errors.New("parent license not found")
	}
	if amount <= 0 {
		return errors.New("amount must be positive")
	}
	if parent.Amount-parent.Consumed < amount {
		return errors.New("insufficient amount in parent license")
	}
	if _, exists := lm.licenses[childID]; exists {
		return errors.New("child license ID already exists")
	}

	// Deduct from parent license's available amount
	parent.Consumed += amount

	// Create child license
	lm.licenses[childID] = &SpendLicense{
		ID:     childID,
		Amount: amount,
	}
	return nil
}

// ConsumeLicense consumes an amount from a license.
// Returns error if license not found or insufficient amount.
func (lm *LicenseManager) ConsumeLicense(id string, amount float64) error {
	lm.mu.Lock()
	defer lm.mu.Unlock()

	lic, exists := lm.licenses[id]
	if !exists {
		return errors.New("license not found")
	}
	if amount <= 0 {
		return errors.New("amount must be positive")
	}
	if lic.Amount-lic.Consumed < amount {
		return errors.New("insufficient amount in license")
	}

	lic.Consumed += amount
	return nil
}

// GetLicense returns a copy of the license by ID.
func (lm *LicenseManager) GetLicense(id string) (*SpendLicense, error) {
	lm.mu.Lock()
	defer lm.mu.Unlock()

	lic, exists := lm.licenses[id]
	if !exists {
		return nil, errors.New("license not found")
	}
	// Return a copy to avoid external mutation
	copy := *lic
	return &copy, nil
}
