package programruntime

import (
	"errors"
	"sync"
	"time"
)

// Constants for spend envelope
const (
	MonthlySpendEnvelope = 8.00 // $8 monthly envelope
)

// LicenseID uniquely identifies a spend license
type LicenseID string

// BadgeID uniquely identifies an ID badge
type BadgeID string

// ShipReceiptID uniquely identifies a ship receipt
type ShipReceiptID string

// License represents a spend license reserved for a program or sub-program
type License struct {
	ID           LicenseID
	ProgramID    string
	Amount       float64
	ReservedAt   time.Time
	Allocated    bool
	AllocatedTo  string // sub-program or agent ID
}

// Badge represents an ID badge issued to an autonomous agent
type Badge struct {
	ID        BadgeID
	AgentID   string
	IssuedAt  time.Time
	Valid     bool
	LicenseID LicenseID
}

// ShipReceipt confirms acceptance of a spend license
type ShipReceipt struct {
	ID         ShipReceiptID
	LicenseID  LicenseID
	AcceptedAt time.Time
	AgentID    string
}

// LicenseManager manages licenses, badges, and ship receipts
type LicenseManager struct {
	mu           sync.Mutex
	licenses     map[LicenseID]*License
	badges       map[BadgeID]*Badge
	shipReceipts map[ShipReceiptID]*ShipReceipt
	monthlySpend float64
}

// NewLicenseManager creates a new LicenseManager
func NewLicenseManager() *LicenseManager {
	return &LicenseManager{
		licenses:     make(map[LicenseID]*License),
		badges:       make(map[BadgeID]*Badge),
		shipReceipts: make(map[ShipReceiptID]*ShipReceipt),
		monthlySpend: 0,
	}
}

// ReserveLicense reserves a spend license for a program or sub-program
func (lm *LicenseManager) ReserveLicense(programID string, amount float64) (LicenseID, error) {
	lm.mu.Lock()
	defer lm.mu.Unlock()

	if amount <= 0 {
		return "", errors.New("amount must be positive")
	}
	if lm.monthlySpend+amount > MonthlySpendEnvelope {
		return "", errors.New("exceeds monthly spend envelope")
	}

	id := LicenseID(generateID("lic"))
	license := &License{
		ID:         id,
		ProgramID:  programID,
		Amount:     amount,
		ReservedAt: time.Now(),
		Allocated:  false,
	}
	lm.licenses[id] = license
	lm.monthlySpend += amount
	return id, nil
}

// FanOutLicense allocates a reserved license to a sub-program or agent
func (lm *LicenseManager) FanOutLicense(licenseID LicenseID, allocatedTo string) error {
	lm.mu.Lock()
	defer lm.mu.Unlock()

	license, ok := lm.licenses[licenseID]
	if !ok {
		return errors.New("license not found")
	}
	if license.Allocated {
		return errors.New("license already allocated")
	}
	license.Allocated = true
	license.AllocatedTo = allocatedTo
	return nil
}

// IssueBadge issues an ID badge to an agent for a given license
func (lm *LicenseManager) IssueBadge(agentID string, licenseID LicenseID) (BadgeID, error) {
	lm.mu.Lock()
	defer lm.mu.Unlock()

	license, ok := lm.licenses[licenseID]
	if !ok {
		return "", errors.New("license not found")
	}
	if !license.Allocated {
		return "", errors.New("license not allocated")
	}

	badgeID := BadgeID(generateID("badge"))
	badge := &Badge{
		ID:        badgeID,
		AgentID:   agentID,
		IssuedAt:  time.Now(),
		Valid:     true,
		LicenseID: licenseID,
	}
	lm.badges[badgeID] = badge
	return badgeID, nil
}

// AcceptLicense accepts a license spend and generates a ship receipt
func (lm *LicenseManager) AcceptLicense(badgeID BadgeID) (ShipReceiptID, error) {
	lm.mu.Lock()
	defer lm.mu.Unlock()

	badge, ok := lm.badges[badgeID]
	if !ok {
		return "", errors.New("badge not found")
	}
	if !badge.Valid {
		return "", errors.New("badge invalid")
	}

	receiptID := ShipReceiptID(generateID("ship"))
	receipt := &ShipReceipt{
		ID:         receiptID,
		LicenseID:  badge.LicenseID,
		AcceptedAt: time.Now(),
		AgentID:    badge.AgentID,
	}
	lm.shipReceipts[receiptID] = receipt

	// Invalidate badge after acceptance
	badge.Valid = false

	return receiptID, nil
}

// Helper function to generate IDs (stubbed for example)
func generateID(prefix string) string {
	return prefix + "-" + time.Now().Format("20060102150405.000000000")
}
