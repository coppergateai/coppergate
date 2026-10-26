package programruntime

import (
	"errors"
	"sync"
	"time"
)

// MonthlySpendEnvelope defines the maximum spend allowed per month.
const MonthlySpendEnvelope = 8.00 // $8 monthly envelope

// LicenseID uniquely identifies a spend license.
type LicenseID string

// IDBadge represents an authorization badge for a program runtime spend license.
type IDBadge struct {
	LicenseID LicenseID
	IssuedAt  time.Time
	Valid     bool
}

// SpendLicense represents a reserved spend license for program runtime.
type SpendLicense struct {
	ID        LicenseID
	Reserved  float64
	Spent     float64
	Badge     *IDBadge
	CreatedAt time.Time
	Accepted  bool
}

// LicenseManager manages spend licenses and enforces spend limits.
type LicenseManager struct {
	mu            sync.Mutex
	licenses      map[LicenseID]*SpendLicense
	totalReserved float64
}

// NewLicenseManager creates a new LicenseManager instance.
func NewLicenseManager() *LicenseManager {
	return &LicenseManager{
		licenses: make(map[LicenseID]*SpendLicense),
	}
}

// ReserveLicense attempts to reserve a spend license for the requested amount.
// Returns an IDBadge if successful.
func (lm *LicenseManager) ReserveLicense(amount float64) (*IDBadge, error) {
	lm.mu.Lock()
	defer lm.mu.Unlock()

	if amount <= 0 {
		return nil, errors.New("amount must be positive")
	}

	if lm.totalReserved+amount > MonthlySpendEnvelope {
		return nil, errors.New("monthly spend envelope exceeded")
	}

	id := LicenseID(generateLicenseID())
	license := &SpendLicense{
		ID:        id,
		Reserved:  amount,
		Spent:     0,
		CreatedAt: time.Now(),
		Accepted:  false,
	}
	badge := &IDBadge{
		LicenseID: id,
		IssuedAt:  time.Now(),
		Valid:     true,
	}
	license.Badge = badge

	lm.licenses[id] = license
	lm.totalReserved += amount

	return badge, nil
}

// AcceptLicense marks the license as accepted and generates a ship receipt.
func (lm *LicenseManager) AcceptLicense(id LicenseID) (*ShipReceipt, error) {
	lm.mu.Lock()
	defer lm.mu.Unlock()

	license, ok := lm.licenses[id]
	if !ok {
		return nil, errors.New("license not found")
	}
	if license.Accepted {
		return nil, errors.New("license already accepted")
	}
	if !license.Badge.Valid {
		return nil, errors.New("invalid badge")
	}

	license.Accepted = true
	license.Badge.Valid = false

	receipt := &ShipReceipt{
		LicenseID: id,
		Timestamp: time.Now(),
		Amount:    license.Reserved,
	}

	return receipt, nil
}

// ShipReceipt confirms the spend license acceptance.
type ShipReceipt struct {
	LicenseID LicenseID
	Timestamp time.Time
	Amount    float64
}

// generateLicenseID generates a unique license ID string.
func generateLicenseID() string {
	return time.Now().Format("20060102150405.000000000")
}
