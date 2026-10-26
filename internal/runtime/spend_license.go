package runtime

import (
	"errors"
	"fmt"
	"sync"
)

// SpendLicense represents a reserved spend license within a program runtime.
type SpendLicense struct {
	ID          string  // unique license ID
	ProgramID   string  // associated program runtime ID
	Amount      float64 // amount reserved
	Consumed   float64 // amount consumed/fanned out
	BadgeID     string  // linked ID badge
	Accepted   bool    // whether license has been accepted
	ShipReceipt string  // receipt ID after acceptance
}

// LicenseManager manages spend licenses within the runtime.
type LicenseManager struct {
	mu        sync.Mutex
	licenses  map[string]*SpendLicense
	badgeSeq  int
	receiptSeq int
}

// NewLicenseManager creates a new LicenseManager.
func NewLicenseManager() *LicenseManager {
	return &LicenseManager{
		licenses: make(map[string]*SpendLicense),
	}
}

// ReserveLicense reserves a spend license for a program runtime.
func (lm *LicenseManager) ReserveLicense(programID string, amount float64) (*SpendLicense, error) {
	if amount <= 0 {
		return nil, errors.New("amount must be positive")
	}
	lm.mu.Lock()
	defer lm.mu.Unlock()

	licenseID := fmt.Sprintf("lic-%s-%d", programID, len(lm.licenses)+1)
	badgeID := fmt.Sprintf("badge-%d", lm.badgeSeq+1)
	lm.badgeSeq++

	license := &SpendLicense{
		ID:        licenseID,
		ProgramID: programID,
		Amount:    amount,
		Consumed:  0,
		BadgeID:   badgeID,
		Accepted:  false,
	}
	lm.licenses[licenseID] = license
	return license, nil
}

// FanOutLicense consumes part of the reserved license amount.
func (lm *LicenseManager) FanOutLicense(licenseID string, amount float64) error {
	if amount <= 0 {
		return errors.New("fan-out amount must be positive")
	}
	lm.mu.Lock()
	defer lm.mu.Unlock()

	license, ok := lm.licenses[licenseID]
	if !ok {
		return errors.New("license not found")
	}
	if license.Accepted {
		return errors.New("cannot fan-out accepted license")
	}
	if license.Consumed+amount > license.Amount {
		return errors.New("fan-out exceeds reserved amount")
	}
	license.Consumed += amount
	return nil
}

// AcceptLicense marks the license as accepted and issues a Ship Receipt.
func (lm *LicenseManager) AcceptLicense(licenseID string) (string, error) {
	lm.mu.Lock()
	defer lm.mu.Unlock()

	license, ok := lm.licenses[licenseID]
	if !ok {
		return "", errors.New("license not found")
	}
	if license.Accepted {
		return "", errors.New("license already accepted")
	}
	license.Accepted = true
	lm.receiptSeq++
	receiptID := fmt.Sprintf("receipt-%d", lm.receiptSeq)
	license.ShipReceipt = receiptID
	return receiptID, nil
}

// GetLicense returns the license by ID.
func (lm *LicenseManager) GetLicense(licenseID string) (*SpendLicense, error) {
	lm.mu.Lock()
	defer lm.mu.Unlock()

	license, ok := lm.licenses[licenseID]
	if !ok {
		return nil, errors.New("license not found")
	}
	return license, nil
}
