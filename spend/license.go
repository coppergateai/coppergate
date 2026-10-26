package spend

import (
	"errors"
	"fmt"
	"sync"
	"time"
)

// License represents a spend license reserved for a program runtime contract.
type License struct {
	ID           string
	ProgramID    string
	Amount       float64
	ReservedAt   time.Time
	Subcontracts map[string]*IDBadge
	Accepted     bool
	Receipt      *ShipReceipt
	mu           sync.Mutex
}

// IDBadge represents an authorization badge issued to a subcontract.
type IDBadge struct {
	BadgeID    string
	LicenseID  string
	Subcontract string
	IssuedAt   time.Time
	Accepted   bool
}

// ShipReceipt represents a confirmation of spend license acceptance.
type ShipReceipt struct {
	ReceiptID string
	BadgeID   string
	Timestamp time.Time
}

// Manager manages spend licenses and related operations.
type Manager struct {
	licenses map[string]*License
	mu       sync.Mutex
}

// NewManager creates a new spend license manager.
func NewManager() *Manager {
	return &Manager{
		licenses: make(map[string]*License),
	}
}

// ReserveLicense reserves a spend license for a program runtime contract.
func (m *Manager) ReserveLicense(programID string, amount float64) (*License, error) {
	if amount <= 0 {
		return nil, errors.New("amount must be positive")
	}
	m.mu.Lock()
	defer m.mu.Unlock()

	licenseID := fmt.Sprintf("lic-%d", time.Now().UnixNano())
	license := &License{
		ID:           licenseID,
		ProgramID:    programID,
		Amount:       amount,
		ReservedAt:   time.Now(),
		Subcontracts: make(map[string]*IDBadge),
	}
	m.licenses[licenseID] = license
	return license, nil
}

// FanOutLicense fans out a reserved license to multiple subcontracts, issuing ID badges.
func (m *Manager) FanOutLicense(licenseID string, subcontracts []string) ([]*IDBadge, error) {
	m.mu.Lock()
	license, ok := m.licenses[licenseID]
	m.mu.Unlock()
	if !ok {
		return nil, fmt.Errorf("license %s not found", licenseID)
	}

	license.mu.Lock()
	defer license.mu.Unlock()

	if license.Accepted {
		return nil, errors.New("license already accepted, cannot fan out")
	}

	badges := make([]*IDBadge, 0, len(subcontracts))
	for _, subcontract := range subcontracts {
		badgeID := fmt.Sprintf("badge-%d", time.Now().UnixNano())
		badge := &IDBadge{
			BadgeID:    badgeID,
			LicenseID:  licenseID,
			Subcontract: subcontract,
			IssuedAt:   time.Now(),
		}
		license.Subcontracts[badgeID] = badge
		badges = append(badges, badge)
		// Sleep a tiny bit to ensure unique timestamps for badge IDs
		time.Sleep(time.Microsecond)
	}
	return badges, nil
}

// AcceptLicense accepts a spend license using an ID badge and generates a ship receipt.
func (m *Manager) AcceptLicense(badgeID string) (*ShipReceipt, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	// Find the license and badge
	var license *License
	var badge *IDBadge
	for _, lic := range m.licenses {
		lic.mu.Lock()
		b, ok := lic.Subcontracts[badgeID]
		if ok {
			license = lic
			badge = b
			lic.mu.Unlock()
			break
		}
		lic.mu.Unlock()
	}
	if license == nil || badge == nil {
		return nil, fmt.Errorf("badge %s not found", badgeID)
	}

	license.mu.Lock()
	defer license.mu.Unlock()

	if badge.Accepted {
		return nil, errors.New("badge already accepted")
	}

	badge.Accepted = true
	license.Accepted = true

	receipt := &ShipReceipt{
		ReceiptID: fmt.Sprintf("receipt-%d", time.Now().UnixNano()),
		BadgeID:   badgeID,
		Timestamp: time.Now(),
	}
	license.Receipt = receipt
	return receipt, nil
}

// GetReceipt returns the ship receipt for a given badge ID.
func (m *Manager) GetReceipt(badgeID string) (*ShipReceipt, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	for _, lic := range m.licenses {
		lic.mu.Lock()
		badge, ok := lic.Subcontracts[badgeID]
		if ok && badge.Accepted && lic.Receipt != nil {
			receipt := lic.Receipt
			lic.mu.Unlock()
			return receipt, nil
		}
		lic.mu.Unlock()
	}
	return nil, fmt.Errorf("receipt not found for badge %s", badgeID)
}
