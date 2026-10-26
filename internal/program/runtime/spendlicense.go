package runtime

import (
	"errors"
	"fmt"
	"sync"
	"time"
)

// LicenseID uniquely identifies a spend license.
type LicenseID string

// ShipReceipt represents confirmation of accepted license usage.
type ShipReceipt struct {
	LicenseID LicenseID
	Timestamp time.Time
	Amount    int
}

// SpendLicenseManager manages spend license reservations and fan-out.
type SpendLicenseManager struct {
	mu             sync.Mutex
	monthlyEnvelope int
	used           int
	licenses       map[LicenseID]*licenseEntry
	counter        int
}

type licenseEntry struct {
	id       LicenseID
	amount   int
	parentID LicenseID
	accepted bool
	badge    string
}

// NewSpendLicenseManager creates a new manager with the given monthly envelope.
func NewSpendLicenseManager(monthlyEnvelope int) *SpendLicenseManager {
	return &SpendLicenseManager{
		monthlyEnvelope: monthlyEnvelope,
		licenses:       make(map[LicenseID]*licenseEntry),
	}
}

// ReserveSpendLicense reserves a spend license for the specified amount if available.
func (m *SpendLicenseManager) ReserveSpendLicense(amount int) (LicenseID, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if amount <= 0 {
		return "", errors.New("amount must be positive")
	}

	if m.used+amount > m.monthlyEnvelope {
		return "", fmt.Errorf("insufficient envelope: requested %d, available %d", amount, m.monthlyEnvelope-m.used)
	}

	m.counter++
	id := LicenseID(fmt.Sprintf("license-%d", m.counter))
	badge := fmt.Sprintf("badge-%d", m.counter)

	m.licenses[id] = &licenseEntry{
		id:       id,
		amount:   amount,
		parentID: "",
		accepted: false,
		badge:    badge,
	}
	m.used += amount

	return id, nil
}

// FanOutLicense fans out a portion of a parent license to a child license.
func (m *SpendLicenseManager) FanOutLicense(parentID LicenseID, amount int) (LicenseID, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	parent, ok := m.licenses[parentID]
	if !ok {
		return "", fmt.Errorf("parent license %s not found", parentID)
	}

	if amount <= 0 {
		return "", errors.New("amount must be positive")
	}

	if parent.accepted {
		return "", errors.New("cannot fan out from accepted license")
	}

	if amount > parent.amount {
		return "", fmt.Errorf("fan-out amount %d exceeds parent license amount %d", amount, parent.amount)
	}

	m.counter++
	childID := LicenseID(fmt.Sprintf("license-%d", m.counter))
	badge := fmt.Sprintf("badge-%d", m.counter)

	// Reduce parent license amount by fan-out amount
	parent.amount -= amount

	m.licenses[childID] = &licenseEntry{
		id:       childID,
		amount:   amount,
		parentID: parentID,
		accepted: false,
		badge:    badge,
	}

	return childID, nil
}

// AcceptLicense accepts the license and returns a Ship Receipt.
func (m *SpendLicenseManager) AcceptLicense(licenseID LicenseID) (ShipReceipt, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	lic, ok := m.licenses[licenseID]
	if !ok {
		return ShipReceipt{}, fmt.Errorf("license %s not found", licenseID)
	}

	if lic.accepted {
		return ShipReceipt{}, errors.New("license already accepted")
	}

	lic.accepted = true

	receipt := ShipReceipt{
		LicenseID: licenseID,
		Timestamp: time.Now(),
		Amount:    lic.amount,
	}

	return receipt, nil
}

// Badge returns the ID badge associated with a license.
func (m *SpendLicenseManager) Badge(licenseID LicenseID) (string, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	lic, ok := m.licenses[licenseID]
	if !ok {
		return "", fmt.Errorf("license %s not found", licenseID)
	}

	return lic.badge, nil
}
