package programruntime

import (
	"errors"
	"fmt"
	"sync"
	"time"

	"github.com/google/uuid"
)

// MonthlySpendEnvelope defines the fixed monthly spend envelope in dollars.
const MonthlySpendEnvelope = 8

// License represents a spend license reservation for a program runtime.
type License struct {
	IDBadge      string    // Unique ID badge for the license
	ReservedAt   time.Time // Timestamp of reservation
	Amount       int       // Amount reserved in dollars
	Accepted     bool      // Whether the license has been accepted
	ShipReceipt  string    // Receipt generated upon acceptance
}

// LicenseManager manages spend licenses within the monthly envelope.
type LicenseManager struct {
	mu            sync.Mutex
	totalReserved int
	licenses      map[string]*License
}

// NewLicenseManager creates a new LicenseManager instance.
func NewLicenseManager() *LicenseManager {
	return &LicenseManager{
		licenses: make(map[string]*License),
	}
}

// Reserve attempts to reserve a spend license for the given amount.
// Returns the License with an ID badge if successful.
func (lm *LicenseManager) Reserve(amount int) (*License, error) {
	if amount <= 0 {
		return nil, errors.New("amount must be positive")
	}
	lm.mu.Lock()
	defer lm.mu.Unlock()

	if lm.totalReserved+amount > MonthlySpendEnvelope {
		return nil, fmt.Errorf("insufficient spend envelope: requested %d, available %d", amount, MonthlySpendEnvelope-lm.totalReserved)
	}

	idBadge := uuid.New().String()
	license := &License{
		IDBadge:    idBadge,
		ReservedAt: time.Now(),
		Amount:     amount,
		Accepted:   false,
	}
	lm.licenses[idBadge] = license
	lm.totalReserved += amount
	return license, nil
}

// Accept marks the license as accepted and generates a ship receipt.
func (lm *LicenseManager) Accept(idBadge string) (string, error) {
	lm.mu.Lock()
	defer lm.mu.Unlock()

	license, ok := lm.licenses[idBadge]
	if !ok {
		return "", errors.New("license not found")
	}
	if license.Accepted {
		return "", errors.New("license already accepted")
	}

	license.Accepted = true
	license.ShipReceipt = fmt.Sprintf("SHIP-RECEIPT-%s-%d", license.IDBadge, time.Now().UnixNano())
	return license.ShipReceipt, nil
}

// GetLicense returns the license by ID badge.
func (lm *LicenseManager) GetLicense(idBadge string) (*License, bool) {
	lm.mu.Lock()
	defer lm.mu.Unlock()
	license, ok := lm.licenses[idBadge]
	return license, ok
}

// Writeback simulates landing and persisting the license state.
// In a real system, this would write to persistent storage.
func (lm *LicenseManager) Writeback(idBadge string) error {
	lm.mu.Lock()
	defer lm.mu.Unlock()

	license, ok := lm.licenses[idBadge]
	if !ok {
		return errors.New("license not found")
	}
	// Simulate writeback logic here.
	// For this implementation, we just log or confirm the writeback.
	// In production, this would be a DB or durable store write.
	return nil
}
