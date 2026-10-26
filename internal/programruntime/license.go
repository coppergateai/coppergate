package programruntime

import (
	"errors"
	"sync"
	"time"
)

// LicenseStatus represents the current state of a spend license.
type LicenseStatus int

const (
	StatusReserved LicenseStatus = iota
	StatusAccepted
	StatusShipped
)

// License represents a spend license for contracted autonomy.
type License struct {
	ID         string
	ProgramID  string
	Amount     float64
	Status     LicenseStatus
	CreatedAt  time.Time
	AcceptedAt *time.Time
	ShippedAt  *time.Time
}

// LicenseManager manages spend licenses and enforces spend caps.
type LicenseManager struct {
	mu            sync.Mutex
	licenses      map[string]*License
	monthlyEnvelope float64
	monthlySpent  map[string]float64 // programID -> amount spent this month
}

// NewLicenseManager creates a new LicenseManager with a monthly spend envelope.
func NewLicenseManager(monthlyEnvelope float64) *LicenseManager {
	return &LicenseManager{
		licenses:       make(map[string]*License),
		monthlyEnvelope: monthlyEnvelope,
		monthlySpent:   make(map[string]float64),
	}
}

// ReserveLicense reserves a spend license for a program if under the monthly envelope.
func (lm *LicenseManager) ReserveLicense(id, programID string, amount float64) (*License, error) {
	lm.mu.Lock()
	defer lm.mu.Unlock()

	spent := lm.monthlySpent[programID]
	if spent+amount > lm.monthlyEnvelope {
		return nil, errors.New("monthly spend envelope exceeded")
	}

	license := &License{
		ID:        id,
		ProgramID: programID,
		Amount:    amount,
		Status:    StatusReserved,
		CreatedAt: time.Now(),
	}
	lm.licenses[id] = license
	// Reserve spend but do not count as spent until accepted
	return license, nil
}

// AcceptLicense marks a reserved license as accepted and updates spend.
func (lm *LicenseManager) AcceptLicense(id string) (*License, error) {
	lm.mu.Lock()
	defer lm.mu.Unlock()

	license, ok := lm.licenses[id]
	if !ok {
		return nil, errors.New("license not found")
	}
	if license.Status != StatusReserved {
		return nil, errors.New("license not in reserved state")
	}

	spent := lm.monthlySpent[license.ProgramID]
	if spent+license.Amount > lm.monthlyEnvelope {
		return nil, errors.New("monthly spend envelope exceeded on accept")
	}

	now := time.Now()
	license.Status = StatusAccepted
	license.AcceptedAt = &now
	lm.monthlySpent[license.ProgramID] += license.Amount
	return license, nil
}

// ShipReceipt marks an accepted license as shipped.
func (lm *LicenseManager) ShipReceipt(id string) (*License, error) {
	lm.mu.Lock()
	defer lm.mu.Unlock()

	license, ok := lm.licenses[id]
	if !ok {
		return nil, errors.New("license not found")
	}
	if license.Status != StatusAccepted {
		return nil, errors.New("license not in accepted state")
	}

	now := time.Now()
	license.Status = StatusShipped
	license.ShippedAt = &now
	return license, nil
}

// GetLicense returns the license by ID.
func (lm *LicenseManager) GetLicense(id string) (*License, error) {
	lm.mu.Lock()
	defer lm.mu.Unlock()

	license, ok := lm.licenses[id]
	if !ok {
		return nil, errors.New("license not found")
	}
	return license, nil
}
