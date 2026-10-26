package programruntime

import (
	"errors"
	"fmt"
	"sync"
	"time"
)

// SpendLicense represents a spend license reservation or allocation.
type SpendLicense struct {
	ID          string    // Unique license ID
	ProgramID   string    // Owning program Open ID
	Amount      float64   // Amount reserved/spent in dollars
	CreatedAt   time.Time // Timestamp of reservation
	FannedOutTo []string  // Sub-program IDs this license was fanned out to
	Accepted    bool      // Whether the license has been accepted
	ShipReceipt string    // Receipt ID after acceptance
}

// IDBadge represents an issued ID badge for runtime entities.
type IDBadge struct {
	BadgeID   string    // Unique badge ID
	ProgramID string    // Owning program Open ID
	IssuedAt  time.Time // Timestamp of issuance
	Valid     bool      // Badge validity
}

// LicenseManager manages spend licenses and ID badges.
type LicenseManager struct {
	mu            sync.Mutex
	licenses      map[string]*SpendLicense
	badges        map[string]*IDBadge
	monthlyEnvelope float64
	usedEnvelope  float64
}

// NewLicenseManager creates a new LicenseManager with a monthly envelope cap.
func NewLicenseManager(monthlyEnvelope float64) *LicenseManager {
	return &LicenseManager{
		licenses:       make(map[string]*SpendLicense),
		badges:         make(map[string]*IDBadge),
		monthlyEnvelope: monthlyEnvelope,
	}
}

// ReserveLicense reserves a spend license for a program if within envelope.
func (lm *LicenseManager) ReserveLicense(programID string, amount float64) (*SpendLicense, error) {
	lm.mu.Lock()
	defer lm.mu.Unlock()

	if amount <= 0 {
		return nil, errors.New("amount must be positive")
	}
	if lm.usedEnvelope+amount > lm.monthlyEnvelope {
		return nil, fmt.Errorf("monthly envelope exceeded: requested %.2f, available %.2f", amount, lm.monthlyEnvelope-lm.usedEnvelope)
	}

	licenseID := fmt.Sprintf("lic-%d", time.Now().UnixNano())
	license := &SpendLicense{
		ID:        licenseID,
		ProgramID: programID,
		Amount:    amount,
		CreatedAt: time.Now(),
	}
	lm.licenses[licenseID] = license
	lm.usedEnvelope += amount
	return license, nil
}

// FanOutLicense fans out a license amount to sub-programs.
func (lm *LicenseManager) FanOutLicense(licenseID string, subProgramIDs []string) error {
	lm.mu.Lock()
	defer lm.mu.Unlock()

	license, ok := lm.licenses[licenseID]
	if !ok {
		return errors.New("license not found")
	}
	if license.Accepted {
		return errors.New("cannot fan-out accepted license")
	}
	license.FannedOutTo = append(license.FannedOutTo, subProgramIDs...)
	return nil
}

// IssueIDBadge issues an ID badge for a program.
func (lm *LicenseManager) IssueIDBadge(programID string) *IDBadge {
	lm.mu.Lock()
	defer lm.mu.Unlock()

	badgeID := fmt.Sprintf("badge-%d", time.Now().UnixNano())
	badge := &IDBadge{
		BadgeID:   badgeID,
		ProgramID: programID,
		IssuedAt:  time.Now(),
		Valid:     true,
	}
	lm.badges[badgeID] = badge
	return badge
}

// AcceptLicense marks a license as accepted and generates a ship receipt.
func (lm *LicenseManager) AcceptLicense(licenseID string) (string, error) {
	lm.mu.Lock()
	defer lm.mu.Unlock()

	license, ok := lm.licenses[licenseID]
	if !ok {
		return "", errors.New("license not found")
	}
	if license.Accepted {
		return "", errors.New("license already accepted")
	}
	receiptID := fmt.Sprintf("receipt-%d", time.Now().UnixNano())
	license.Accepted = true
	license.ShipReceipt = receiptID
	return receiptID, nil
}

// GetLicense returns a license by ID.
func (lm *LicenseManager) GetLicense(licenseID string) (*SpendLicense, bool) {
	lm.mu.Lock()
	defer lm.mu.Unlock()

	license, ok := lm.licenses[licenseID]
	return license, ok
}

// GetBadge returns a badge by ID.
func (lm *LicenseManager) GetBadge(badgeID string) (*IDBadge, bool) {
	lm.mu.Lock()
	defer lm.mu.Unlock()

	badge, ok := lm.badges[badgeID]
	return badge, ok
}
