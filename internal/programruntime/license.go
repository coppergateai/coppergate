package programruntime

import (
	"errors"
	"sync"
	"time"
)

// Constants for spend limits
const (
	MonthlySpendEnvelopeCents = 800 // $8.00 in cents
)

// LicenseManager manages spend licenses for program runtime.
type LicenseManager struct {
	mu               sync.Mutex
	monthlySpendUsed  int // in cents
	currentMonth     time.Month
	currentYear      int
	idBadgeCounter   int
	activeLicenses   map[string]*SpendLicense
	shipReceipts     map[string]*ShipReceipt
}

// SpendLicense represents a reserved spend license.
type SpendLicense struct {
	ID        string
	AmountCents int
	IssuedAt  time.Time
	IDBadge   string
	FannedOut bool
}

// ShipReceipt represents the acceptance and confirmation of a spend license.
type ShipReceipt struct {
	LicenseID string
	AcceptedAt time.Time
	BadgeID   string
}

// NewLicenseManager creates a new LicenseManager instance.
func NewLicenseManager() *LicenseManager {
	now := time.Now()
	return &LicenseManager{
		monthlySpendUsed: 0,
		currentMonth:     now.Month(),
		currentYear:      now.Year(),
		idBadgeCounter:   0,
		activeLicenses:   make(map[string]*SpendLicense),
		shipReceipts:     make(map[string]*ShipReceipt),
	}
}

// ReserveSpendLicense attempts to reserve a spend license for the given amount in cents.
// Returns the reserved license or an error if the monthly envelope is exceeded.
func (lm *LicenseManager) ReserveSpendLicense(amountCents int) (*SpendLicense, error) {
	lm.mu.Lock()
	defer lm.mu.Unlock()

	now := time.Now()
	// Reset monthly spend if month changed
	if now.Month() != lm.currentMonth || now.Year() != lm.currentYear {
		lm.monthlySpendUsed = 0
		lm.currentMonth = now.Month()
		lm.currentYear = now.Year()
	}

	if amountCents <= 0 {
		return nil, errors.New("amount must be positive")
	}

	if lm.monthlySpendUsed+amountCents > MonthlySpendEnvelopeCents {
		return nil, errors.New("monthly spend envelope exceeded")
	}

	lm.monthlySpendUsed += amountCents
	lm.idBadgeCounter++
	licenseID := generateLicenseID(lm.idBadgeCounter)
	idBadge := generateIDBadge(lm.idBadgeCounter)

	license := &SpendLicense{
		ID:         licenseID,
		AmountCents: amountCents,
		IssuedAt:   now,
		IDBadge:    idBadge,
		FannedOut:  false,
	}
	lm.activeLicenses[licenseID] = license
	return license, nil
}

// FanOutLicense marks the license as fanned out (distributed).
func (lm *LicenseManager) FanOutLicense(licenseID string) error {
	lm.mu.Lock()
	defer lm.mu.Unlock()

	license, ok := lm.activeLicenses[licenseID]
	if !ok {
		return errors.New("license not found")
	}
	if license.FannedOut {
		return errors.New("license already fanned out")
	}
	license.FannedOut = true
	return nil
}

// AcceptLicense accepts a license and generates a ShipReceipt.
func (lm *LicenseManager) AcceptLicense(licenseID string, badgeID string) (*ShipReceipt, error) {
	lm.mu.Lock()
	defer lm.mu.Unlock()

	license, ok := lm.activeLicenses[licenseID]
	if !ok {
		return nil, errors.New("license not found")
	}
	if license.IDBadge != badgeID {
		return nil, errors.New("invalid badge ID for license")
	}

	receipt := &ShipReceipt{
		LicenseID: licenseID,
		AcceptedAt: time.Now(),
		BadgeID:   badgeID,
	}
	lm.shipReceipts[licenseID] = receipt
	return receipt, nil
}

// generateLicenseID generates a unique license ID based on a counter.
func generateLicenseID(counter int) string {
	return "LIC-" + itoa(counter)
}

// generateIDBadge generates a unique ID badge string based on a counter.
func generateIDBadge(counter int) string {
	return "BADGE-" + itoa(counter)
}

// itoa converts int to string without importing strconv for simplicity.
func itoa(i int) string {
	if i == 0 {
		return "0"
	}
	var s []byte
	for i > 0 {
		s = append([]byte{byte('0' + i%10)}, s...)
		i /= 10
	}
	return string(s)
}
