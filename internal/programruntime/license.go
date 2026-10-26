package programruntime

import (
	"errors"
	"sync"
	"time"
)

// MonthlyEnvelope defines the spend cap per month.
const MonthlyEnvelope = 8.00

// License represents a spend license reserved for a program runtime.
type License struct {
	ID           string    // Unique license ID
	ReservedAt   time.Time // Timestamp when reserved
	Amount       float64   // Amount reserved (<= MonthlyEnvelope)
	FannedOut    bool      // Whether license has been fanned out
	Accepted     bool      // Whether license has been accepted
	ShipReceipt  bool      // Whether ship receipt confirmed
	IDBadge      string    // ID badge issued to runtime
	WrittenBack  bool      // Whether usage has been written back
}

// LicenseManager manages licenses and spend accounting.
type LicenseManager struct {
	mu            sync.Mutex
	totalReserved float64
	licenses      map[string]*License
}

// NewLicenseManager creates a new LicenseManager.
func NewLicenseManager() *LicenseManager {
	return &LicenseManager{
		licenses: make(map[string]*License),
	}
}

// ReserveLicense reserves a license amount if within monthly envelope.
func (lm *LicenseManager) ReserveLicense(id string, amount float64) (*License, error) {
	lm.mu.Lock()
	defer lm.mu.Unlock()

	if amount <= 0 {
		return nil, errors.New("amount must be positive")
	}
	if lm.totalReserved+amount > MonthlyEnvelope {
		return nil, errors.New("monthly envelope exceeded")
	}
	if _, exists := lm.licenses[id]; exists {
		return nil, errors.New("license ID already exists")
	}

	license := &License{
		ID:         id,
		ReservedAt: time.Now(),
		Amount:     amount,
	}
	lm.licenses[id] = license
	lm.totalReserved += amount
	return license, nil
}

// FanOutLicense marks the license as fanned out.
func (lm *LicenseManager) FanOutLicense(id string) error {
	lm.mu.Lock()
	defer lm.mu.Unlock()

	license, exists := lm.licenses[id]
	if !exists {
		return errors.New("license not found")
	}
	if license.FannedOut {
		return errors.New("license already fanned out")
	}
	license.FannedOut = true
	return nil
}

// IssueIDBadge issues an ID badge to the license.
func (lm *LicenseManager) IssueIDBadge(id string, badge string) error {
	lm.mu.Lock()
	defer lm.mu.Unlock()

	license, exists := lm.licenses[id]
	if !exists {
		return errors.New("license not found")
	}
	if license.IDBadge != "" {
		return errors.New("ID badge already issued")
	}
	license.IDBadge = badge
	return nil
}

// AcceptLicense marks the license as accepted and triggers ship receipt.
func (lm *LicenseManager) AcceptLicense(id string) error {
	lm.mu.Lock()
	defer lm.mu.Unlock()

	license, exists := lm.licenses[id]
	if !exists {
		return errors.New("license not found")
	}
	if license.Accepted {
		return errors.New("license already accepted")
	}
	license.Accepted = true
	license.ShipReceipt = true
	return nil
}

// WriteBackUsage marks the license usage as written back.
func (lm *LicenseManager) WriteBackUsage(id string) error {
	lm.mu.Lock()
	defer lm.mu.Unlock()

	license, exists := lm.licenses[id]
	if !exists {
		return errors.New("license not found")
	}
	if !license.ShipReceipt {
		return errors.New("ship receipt not confirmed")
	}
	if license.WrittenBack {
		return errors.New("usage already written back")
	}
	license.WrittenBack = true
	return nil
}

// GetLicense returns a copy of the license by ID.
func (lm *LicenseManager) GetLicense(id string) (*License, error) {
	lm.mu.Lock()
	defer lm.mu.Unlock()

	license, exists := lm.licenses[id]
	if !exists {
		return nil, errors.New("license not found")
	}
	// Return a copy to avoid external mutation
	copy := *license
	return &copy, nil
}
