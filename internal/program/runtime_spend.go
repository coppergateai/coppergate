package program

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"sync"
	"time"
)

// Constants for spend envelope and badge validity
const (
	MonthlySpendEnvelopeCents = 800 // $8.00 in cents
	BadgeValidityDuration     = 24 * time.Hour
)

// ErrInsufficientSpend indicates not enough spend available for reservation or fan-out.
var ErrInsufficientSpend = errors.New("insufficient spend available")

// SpendLicense represents a reserved spend license.
type SpendLicense struct {
	ProgramID   string
	ReservedCents int
	FannedOutCents int
	Badges      map[string]*IDBadge
	Accepted    bool
	ShipReceipt *ShipReceipt
	mu          sync.Mutex
}

// IDBadge represents an ID badge issued to a program instance.
type IDBadge struct {
	BadgeID    string
	IssuedAt   time.Time
	ExpiresAt  time.Time
	Signature  string // simplified signature
}

// ShipReceipt represents a receipt generated upon acceptance.
type ShipReceipt struct {
	ProgramID string
	Timestamp time.Time
	ReceiptID string
}

// RuntimeSpendManager manages spend licenses for programs.
type RuntimeSpendManager struct {
	licenses map[string]*SpendLicense
	mu       sync.Mutex
}

// NewRuntimeSpendManager creates a new RuntimeSpendManager.
func NewRuntimeSpendManager() *RuntimeSpendManager {
	return &RuntimeSpendManager{
		licenses: make(map[string]*SpendLicense),
	}
}

// ReserveSpend reserves spend for a program up to the monthly envelope.
func (m *RuntimeSpendManager) ReserveSpend(programID string, amountCents int) error {
	if amountCents <= 0 {
		return fmt.Errorf("amount must be positive")
	}
	if amountCents > MonthlySpendEnvelopeCents {
		return fmt.Errorf("amount exceeds monthly spend envelope")
	}

	m.mu.Lock()
	defer m.mu.Unlock()

	license, exists := m.licenses[programID]
	if !exists {
		license = &SpendLicense{
			ProgramID: programID,
			Badges:    make(map[string]*IDBadge),
		}
		m.licenses[programID] = license
	}

	license.mu.Lock()
	defer license.mu.Unlock()

	if license.ReservedCents+amountCents > MonthlySpendEnvelopeCents {
		return ErrInsufficientSpend
	}

	license.ReservedCents += amountCents
	return nil
}

// FanOutSpend fans out reserved spend to a child program.
func (m *RuntimeSpendManager) FanOutSpend(parentID, childID string, amountCents int) error {
	if amountCents <= 0 {
		return fmt.Errorf("amount must be positive")
	}

	m.mu.Lock()
	defer m.mu.Unlock()

	parentLicense, exists := m.licenses[parentID]
	if !exists {
		return fmt.Errorf("parent program license not found")
	}

	parentLicense.mu.Lock()
	defer parentLicense.mu.Unlock()

	available := parentLicense.ReservedCents - parentLicense.FannedOutCents
	if amountCents > available {
		return ErrInsufficientSpend
	}

	childLicense, exists := m.licenses[childID]
	if !exists {
		childLicense = &SpendLicense{
			ProgramID: childID,
			Badges:    make(map[string]*IDBadge),
		}
		m.licenses[childID] = childLicense
	}

	childLicense.mu.Lock()
	defer childLicense.mu.Unlock()

	parentLicense.FannedOutCents += amountCents
	childLicense.ReservedCents += amountCents
	return nil
}

// IssueBadge issues an ID badge for a program.
func (m *RuntimeSpendManager) IssueBadge(programID string) (*IDBadge, error) {
	m.mu.Lock()
	license, exists := m.licenses[programID]
	m.mu.Unlock()
	if !exists {
		return nil, fmt.Errorf("program license not found")
	}

	license.mu.Lock()
	defer license.mu.Unlock()

	badgeID, err := generateRandomID()
	if err != nil {
		return nil, err
	}
	now := time.Now()
	badge := &IDBadge{
		BadgeID:   badgeID,
		IssuedAt:  now,
		ExpiresAt: now.Add(BadgeValidityDuration),
	}
	badge.Signature = badge.sign()

	license.Badges[badgeID] = badge
	return badge, nil
}

// AcceptLicense marks the spend license as accepted and generates a ship receipt.
func (m *RuntimeSpendManager) AcceptLicense(programID string) (*ShipReceipt, error) {
	m.mu.Lock()
	license, exists := m.licenses[programID]
	m.mu.Unlock()
	if !exists {
		return nil, fmt.Errorf("program license not found")
	}

	license.mu.Lock()
	defer license.mu.Unlock()

	if license.Accepted {
		return nil, fmt.Errorf("license already accepted")
	}

	license.Accepted = true
	receiptID, err := generateRandomID()
	if err != nil {
		return nil, err
	}
	receipt := &ShipReceipt{
		ProgramID: programID,
		Timestamp: time.Now(),
		ReceiptID: receiptID,
	}
	license.ShipReceipt = receipt
	return receipt, nil
}

// generateRandomID creates a random hex string ID.
func generateRandomID() (string, error) {
	b := make([]byte, 16)
	_, err := rand.Read(b)
	if err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

// sign creates a simplified signature for the badge.
func (b *IDBadge) sign() string {
	h := sha256.New()
	h.Write([]byte(b.BadgeID))
	h.Write([]byte(b.IssuedAt.String()))
	h.Write([]byte(b.ExpiresAt.String()))
	return hex.EncodeToString(h.Sum(nil))
}
