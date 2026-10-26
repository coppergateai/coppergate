package programruntime

import (
	"errors"
	"fmt"
	"sync"
	"time"
)

// Constants for spend limits
const (
	MonthlySpendEnvelope = 8.0 // $8 monthly envelope
)

// LicenseManager manages spend licenses for programs.
type LicenseManager struct {
	mu            sync.Mutex
	balances      map[string]float64 // programID -> remaining license balance for current month
	badgeRegistry map[string]*IDBadge
	receipts      []*ShipReceipt
}

// IDBadge represents an ID badge issued to a program or agent.
type IDBadge struct {
	ID        string
	ProgramID string
	IssuedAt  time.Time
	Valid     bool
}

// ShipReceipt represents a receipt generated upon acceptance.
type ShipReceipt struct {
	ReceiptID string
	BadgeID   string
	ProgramID string
	Amount    float64
	Timestamp time.Time
}

// NewLicenseManager creates a new LicenseManager instance.
func NewLicenseManager() *LicenseManager {
	return &LicenseManager{
		balances:      make(map[string]float64),
		badgeRegistry: make(map[string]*IDBadge),
		receipts:      []*ShipReceipt{},
	}
}

// ReserveLicense attempts to reserve a spend license amount for a program.
// Returns an ID badge if successful.
func (lm *LicenseManager) ReserveLicense(programID string, amount float64) (*IDBadge, error) {
	if amount <= 0 {
		return nil, errors.New("amount must be positive")
	}
	if amount > MonthlySpendEnvelope {
		return nil, fmt.Errorf("amount exceeds monthly spend envelope of $%.2f", MonthlySpendEnvelope)
	}

	lm.mu.Lock()
	defer lm.mu.Unlock()

	currentBalance, ok := lm.balances[programID]
	if !ok {
		currentBalance = MonthlySpendEnvelope
	}
	if amount > currentBalance {
		return nil, fmt.Errorf("insufficient license balance: requested %.2f, available %.2f", amount, currentBalance)
	}

	// Deduct amount
	lm.balances[programID] = currentBalance - amount

	// Issue ID badge
	badgeID := fmt.Sprintf("badge-%s-%d", programID, time.Now().UnixNano())
	badge := &IDBadge{
		ID:        badgeID,
		ProgramID: programID,
		IssuedAt:  time.Now(),
		Valid:     true,
	}
	lm.badgeRegistry[badgeID] = badge

	return badge, nil
}

// ValidateBadge checks if a badge is valid and belongs to the given program.
func (lm *LicenseManager) ValidateBadge(badgeID, programID string) bool {
	lm.mu.Lock()
	defer lm.mu.Unlock()

	badge, ok := lm.badgeRegistry[badgeID]
	if !ok || !badge.Valid {
		return false
	}
	return badge.ProgramID == programID
}

// AcceptLicense accepts a license usage by badge ID and generates a ship receipt.
func (lm *LicenseManager) AcceptLicense(badgeID string, amount float64) (*ShipReceipt, error) {
	if amount <= 0 {
		return nil, errors.New("amount must be positive")
	}

	lm.mu.Lock()
	defer lm.mu.Unlock()

	badge, ok := lm.badgeRegistry[badgeID]
	if !ok || !badge.Valid {
		return nil, errors.New("invalid or expired badge")
	}

	// Generate ship receipt
	receiptID := fmt.Sprintf("receipt-%s-%d", badgeID, time.Now().UnixNano())
	receipt := &ShipReceipt{
		ReceiptID: receiptID,
		BadgeID:   badgeID,
		ProgramID: badge.ProgramID,
		Amount:    amount,
		Timestamp: time.Now(),
	}
	lm.receipts = append(lm.receipts, receipt)

	// Invalidate badge after acceptance
	badge.Valid = false

	return receipt, nil
}

// GetBalance returns the remaining license balance for a program.
func (lm *LicenseManager) GetBalance(programID string) float64 {
	lm.mu.Lock()
	defer lm.mu.Unlock()

	balance, ok := lm.balances[programID]
	if !ok {
		return MonthlySpendEnvelope
	}
	return balance
}

// GetReceipts returns all ship receipts.
func (lm *LicenseManager) GetReceipts() []*ShipReceipt {
	lm.mu.Lock()
	defer lm.mu.Unlock()

	copies := make([]*ShipReceipt, len(lm.receipts))
	copy(copies, lm.receipts)
	return copies
}
