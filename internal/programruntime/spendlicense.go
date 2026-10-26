package programruntime

import (
	"errors"
	"fmt"
	"sync"
	"time"
)

// SpendLicense represents a spend license for a program runtime.
type SpendLicense struct {
	ID           string
	ProgramID    string
	ReservedAt   time.Time
	AcceptedAt   *time.Time
	ShipReceipt  string
	IDBadge      string
	Amount       float64 // Amount reserved in dollars
	IsActive     bool
	IsWrittenBack bool
}

// SpendLicenseManager manages spend licenses.
type SpendLicenseManager struct {
	mu            sync.Mutex
	licenses      map[string]*SpendLicense
	monthlyEnvelope float64
}

// NewSpendLicenseManager creates a new SpendLicenseManager with a monthly envelope limit.
func NewSpendLicenseManager(monthlyEnvelope float64) *SpendLicenseManager {
	return &SpendLicenseManager{
		licenses:       make(map[string]*SpendLicense),
		monthlyEnvelope: monthlyEnvelope,
	}
}

// ReserveSpendLicense reserves a spend license for a program with a specified amount.
// Returns the new SpendLicense or error if amount exceeds envelope.
func (m *SpendLicenseManager) ReserveSpendLicense(programID string, amount float64) (*SpendLicense, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if amount <= 0 {
		return nil, errors.New("amount must be positive")
	}
	if amount > m.monthlyEnvelope {
		return nil, fmt.Errorf("amount %.2f exceeds monthly envelope %.2f", amount, m.monthlyEnvelope)
	}

	// Generate ID and IDBadge (simplified for example)
	id := fmt.Sprintf("license-%d", time.Now().UnixNano())
	idBadge := fmt.Sprintf("badge-%s", id)

	license := &SpendLicense{
		ID:         id,
		ProgramID:  programID,
		ReservedAt: time.Now(),
		IDBadge:    idBadge,
		Amount:     amount,
		IsActive:   false,
	}

	m.licenses[id] = license
	return license, nil
}

// AcceptSpendLicense accepts a reserved spend license by ID.
// Returns the ship receipt or error if license not found or already accepted.
func (m *SpendLicenseManager) AcceptSpendLicense(licenseID string) (string, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	license, ok := m.licenses[licenseID]
	if !ok {
		return "", errors.New("spend license not found")
	}
	if license.IsActive {
		return "", errors.New("spend license already accepted")
	}

	now := time.Now()
	license.AcceptedAt = &now
	license.IsActive = true

	// Generate ship receipt (simplified)
	license.ShipReceipt = fmt.Sprintf("ship-receipt-%s-%d", license.ID, now.UnixNano())

	return license.ShipReceipt, nil
}

// WritebackSpendLicense marks the spend license as written back to the system.
func (m *SpendLicenseManager) WritebackSpendLicense(licenseID string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	license, ok := m.licenses[licenseID]
	if !ok {
		return errors.New("spend license not found")
	}
	if !license.IsActive {
		return errors.New("cannot writeback inactive license")
	}
	if license.IsWrittenBack {
		return errors.New("license already written back")
	}

	license.IsWrittenBack = true
	return nil
}

// GetSpendLicense returns a spend license by ID.
func (m *SpendLicenseManager) GetSpendLicense(licenseID string) (*SpendLicense, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	license, ok := m.licenses[licenseID]
	if !ok {
		return nil, errors.New("spend license not found")
	}
	return license, nil
}
