package programruntime

import (
	"errors"
	"fmt"
	"sync"
	"time"
)

// License represents a spend license for program runtime.
type License struct {
	ID           string    // Unique license ID
	BadgeID      string    // Associated ID badge
	ReservedAt   time.Time // Timestamp of reservation
	AcceptedAt   time.Time // Timestamp of acceptance
	ShipReceipt  string    // Ship receipt ID after acceptance
	SpendAmount  float64   // Amount reserved/spent in dollars
	IsAccepted   bool      // Whether license is accepted
	IsWrittenBack bool     // Whether state is written back
}

// LicenseManager manages licenses with reservation, fan-out, acceptance, and writeback.
type LicenseManager struct {
	mu            sync.Mutex
	licenses      map[string]*License
	monthlyEnvelope float64
	usedAmount    float64
}

// NewLicenseManager creates a new LicenseManager with a spend envelope.
func NewLicenseManager(monthlyEnvelope float64) *LicenseManager {
	return &LicenseManager{
		licenses:       make(map[string]*License),
		monthlyEnvelope: monthlyEnvelope,
		usedAmount:     0,
	}
}

// ReserveLicense reserves a license with a given spend amount and badge ID.
// Returns license ID or error if envelope exceeded.
func (lm *LicenseManager) ReserveLicense(spendAmount float64, badgeID string) (string, error) {
	lm.mu.Lock()
	defer lm.mu.Unlock()

	if spendAmount <= 0 {
		return "", errors.New("spend amount must be positive")
	}
	if lm.usedAmount+spendAmount > lm.monthlyEnvelope {
		return "", fmt.Errorf("monthly spend envelope exceeded: requested %.2f, available %.2f", spendAmount, lm.monthlyEnvelope-lm.usedAmount)
	}

	licenseID := fmt.Sprintf("lic-%d", time.Now().UnixNano())
	license := &License{
		ID:          licenseID,
		BadgeID:     badgeID,
		ReservedAt:  time.Now(),
		SpendAmount: spendAmount,
		IsAccepted:  false,
	}
	lm.licenses[licenseID] = license
	lm.usedAmount += spendAmount

	return licenseID, nil
}

// FanOutLicense duplicates a license for fan-out to multiple agents.
// Returns new license ID or error.
func (lm *LicenseManager) FanOutLicense(originalID, newBadgeID string) (string, error) {
	lm.mu.Lock()
	defer lm.mu.Unlock()

	orig, ok := lm.licenses[originalID]
	if !ok {
		return "", errors.New("original license not found")
	}
	if !orig.IsAccepted {
		return "", errors.New("original license must be accepted before fan-out")
	}

	// Fan-out licenses do not consume additional spend, just duplicates with new badge.
	newID := fmt.Sprintf("lic-%d", time.Now().UnixNano())
	license := &License{
		ID:          newID,
		BadgeID:     newBadgeID,
		ReservedAt:  time.Now(),
		SpendAmount: orig.SpendAmount,
		IsAccepted:  false,
	}
	lm.licenses[newID] = license
	return newID, nil
}

// AcceptLicense marks a license as accepted and generates a ship receipt.
func (lm *LicenseManager) AcceptLicense(licenseID string) (string, error) {
	lm.mu.Lock()
	defer lm.mu.Unlock()

	lic, ok := lm.licenses[licenseID]
	if !ok {
		return "", errors.New("license not found")
	}
	if lic.IsAccepted {
		return "", errors.New("license already accepted")
	}

	lic.IsAccepted = true
	lic.AcceptedAt = time.Now()
	lic.ShipReceipt = fmt.Sprintf("ship-%d", time.Now().UnixNano())
	return lic.ShipReceipt, nil
}

// WriteBackLicense marks the license state as written back.
func (lm *LicenseManager) WriteBackLicense(licenseID string) error {
	lm.mu.Lock()
	defer lm.mu.Unlock()

	lic, ok := lm.licenses[licenseID]
	if !ok {
		return errors.New("license not found")
	}
	if !lic.IsAccepted {
		return errors.New("license must be accepted before writeback")
	}
	if lic.IsWrittenBack {
		return errors.New("license already written back")
	}

	lic.IsWrittenBack = true
	return nil
}

// GetLicense returns a copy of the license by ID.
func (lm *LicenseManager) GetLicense(licenseID string) (*License, error) {
	lm.mu.Lock()
	defer lm.mu.Unlock()

	lic, ok := lm.licenses[licenseID]
	if !ok {
		return nil, errors.New("license not found")
	}
	// Return a copy to avoid external mutation.
	copyLic := *lic
	return &copyLic, nil
}
