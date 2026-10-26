package runtime

import (
	"errors"
	"fmt"
	"sync"
	"time"
)

// Constants for spend limits
const (
	MonthlyEnvelopeLimit = 8.00 // $8 monthly envelope
)

// IDBadge represents a program identity badge
type IDBadge struct {
	ProgramID string
	IssuedAt  time.Time
	Valid     bool
}

// SpendLicense represents a reserved spend license for runtime autonomy
type SpendLicense struct {
	LicenseID   string
	ProgramID   string
	Amount      float64
	IssuedAt    time.Time
	Accepted    bool
	ShipReceipt string
}

// SpendLicenseManager manages spend licenses and ID badges
type SpendLicenseManager struct {
	mu             sync.Mutex
	badges         map[string]IDBadge
	licenses       map[string]SpendLicense
	monthlySpend   map[string]float64 // programID -> spend this month
	currentMonth   time.Month
	currentYear    int
}

// NewSpendLicenseManager creates a new SpendLicenseManager
func NewSpendLicenseManager() *SpendLicenseManager {
	now := time.Now()
	return &SpendLicenseManager{
		badges:       make(map[string]IDBadge),
		licenses:     make(map[string]SpendLicense),
		monthlySpend: make(map[string]float64),
		currentMonth: now.Month(),
		currentYear:  now.Year(),
	}
}

// IssueIDBadge issues a new ID badge for a program
func (m *SpendLicenseManager) IssueIDBadge(programID string) IDBadge {
	m.mu.Lock()
	defer m.mu.Unlock()
	badge := IDBadge{
		ProgramID: programID,
		IssuedAt:  time.Now(),
		Valid:     true,
	}
	m.badges[programID] = badge
	return badge
}

// ValidateIDBadge checks if the badge is valid
func (m *SpendLicenseManager) ValidateIDBadge(badge IDBadge) bool {
	m.mu.Lock()
	defer m.mu.Unlock()
	stored, ok := m.badges[badge.ProgramID]
	if !ok {
		return false
	}
	return stored.Valid && stored.IssuedAt.Equal(badge.IssuedAt)
}

// ReserveSpendLicense reserves a spend license for a program if within monthly envelope
func (m *SpendLicenseManager) ReserveSpendLicense(programID string, amount float64) (SpendLicense, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	now := time.Now()
	if now.Month() != m.currentMonth || now.Year() != m.currentYear {
		// Reset monthly spend tracking on month change
		m.monthlySpend = make(map[string]float64)
		m.currentMonth = now.Month()
		m.currentYear = now.Year()
	}

	currentSpend := m.monthlySpend[programID]
	if currentSpend+amount > MonthlyEnvelopeLimit {
		return SpendLicense{}, fmt.Errorf("monthly spend envelope exceeded for program %s", programID)
	}

	licenseID := fmt.Sprintf("%s-%d", programID, now.UnixNano())
	license := SpendLicense{
		LicenseID: licenseID,
		ProgramID: programID,
		Amount:    amount,
		IssuedAt:  now,
		Accepted:  false,
	}
	m.licenses[licenseID] = license
	m.monthlySpend[programID] = currentSpend + amount
	return license, nil
}

// AcceptSpendLicense marks a spend license as accepted and generates a ship receipt
func (m *SpendLicenseManager) AcceptSpendLicense(licenseID string) (string, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	license, ok := m.licenses[licenseID]
	if !ok {
		return "", errors.New("license not found")
	}
	if license.Accepted {
		return "", errors.New("license already accepted")
	}
	license.Accepted = true
	license.ShipReceipt = fmt.Sprintf("SHIP-RECEIPT-%s-%d", license.LicenseID, time.Now().UnixNano())
	m.licenses[licenseID] = license
	return license.ShipReceipt, nil
}

// LandingWriteback simulates landing and writing back spend license state
func (m *SpendLicenseManager) LandingWriteback(licenseID string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	license, ok := m.licenses[licenseID]
	if !ok {
		return errors.New("license not found")
	}
	if !license.Accepted {
		return errors.New("license not accepted yet")
	}
	// Here we would persist the license state to durable storage.
	// For this implementation, we simulate success.
	return nil
}
