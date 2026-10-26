package runtime

import (
	"errors"
	"fmt"
	"sync"
	"time"
)

// MonthlyEnvelope defines the spend cap per month.
const MonthlyEnvelopeCents = 800 // $8.00 in cents

// SpendLicense represents a spend license allocated to a runtime.
type SpendLicense struct {
	ID        string    // Unique ID badge
	Amount    int       // Amount in cents allocated
	Reserved  bool      // Whether reserved
	Accepted  bool      // Whether accepted
	CreatedAt time.Time // Timestamp of creation
	ParentID  string    // Parent license ID if fanned out
}

// SpendLicenseManager manages spend licenses within the monthly envelope.
type SpendLicenseManager struct {
	mu            sync.Mutex
	totalReserved int
	licenses      map[string]*SpendLicense
}

// NewSpendLicenseManager creates a new SpendLicenseManager.
func NewSpendLicenseManager() *SpendLicenseManager {
	return &SpendLicenseManager{
		licenses: make(map[string]*SpendLicense),
	}
}

// Reserve attempts to reserve an amount of spend license.
// Returns a new SpendLicense with a unique ID badge if successful.
func (m *SpendLicenseManager) Reserve(amount int, parentID string) (*SpendLicense, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if amount <= 0 {
		return nil, errors.New("amount must be positive")
	}

	if m.totalReserved+amount > MonthlyEnvelopeCents {
		return nil, fmt.Errorf("reservation exceeds monthly envelope: requested %d, available %d",
			amount, MonthlyEnvelopeCents-m.totalReserved)
	}

	id := generateIDBadge()
	license := &SpendLicense{
		ID:        id,
		Amount:    amount,
		Reserved:  true,
		Accepted:  false,
		CreatedAt: time.Now(),
		ParentID:  parentID,
	}
	m.licenses[id] = license
	m.totalReserved += amount
	return license, nil
}

// FanOut creates child spend licenses from a parent license.
// The sum of child amounts must not exceed the parent license amount.
func (m *SpendLicenseManager) FanOut(parentID string, childAmounts []int) ([]*SpendLicense, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	parent, ok := m.licenses[parentID]
	if !ok {
		return nil, fmt.Errorf("parent license %s not found", parentID)
	}
	if !parent.Reserved {
		return nil, fmt.Errorf("parent license %s is not reserved", parentID)
	}
	if parent.Accepted {
		return nil, fmt.Errorf("parent license %s already accepted", parentID)
	}

	totalChild := 0
	for _, amt := range childAmounts {
		if amt <= 0 {
			return nil, errors.New("child amounts must be positive")
		}
		totalChild += amt
	}
	if totalChild > parent.Amount {
		return nil, fmt.Errorf("child amounts %d exceed parent license amount %d", totalChild, parent.Amount)
	}

	children := make([]*SpendLicense, 0, len(childAmounts))
	for _, amt := range childAmounts {
		id := generateIDBadge()
		child := &SpendLicense{
			ID:        id,
			Amount:    amt,
			Reserved:  true,
			Accepted:  false,
			CreatedAt: time.Now(),
			ParentID:  parentID,
		}
		m.licenses[id] = child
		children = append(children, child)
	}

	// Adjust parent license amount to remaining after fan-out
	parent.Amount -= totalChild

	return children, nil
}

// Accept marks a spend license as accepted and returns a ShipReceipt.
func (m *SpendLicenseManager) Accept(licenseID string) (*ShipReceipt, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	license, ok := m.licenses[licenseID]
	if !ok {
		return nil, fmt.Errorf("license %s not found", licenseID)
	}
	if !license.Reserved {
		return nil, fmt.Errorf("license %s is not reserved", licenseID)
	}
	if license.Accepted {
		return nil, fmt.Errorf("license %s already accepted", licenseID)
	}

	license.Accepted = true

	receipt := &ShipReceipt{
		LicenseID: license.ID,
		Amount:    license.Amount,
		Timestamp: time.Now(),
	}

	return receipt, nil
}

// ShipReceipt confirms acceptance of a spend license.
type ShipReceipt struct {
	LicenseID string
	Amount    int
	Timestamp time.Time
}

// generateIDBadge generates a unique ID badge string.
// For simplicity, use timestamp + random suffix.
func generateIDBadge() string {
	return fmt.Sprintf("ID-%d", time.Now().UnixNano())
}
