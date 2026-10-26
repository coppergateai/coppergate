package runtime

import (
	"errors"
	"fmt"
	"sync"
	"time"
)

// SpendLicense represents a contracted autonomy spend license.
type SpendLicense struct {
	ID          string
	ProgramID   string
	Amount      float64
	ReservedAt  time.Time
	Consumed    bool
	ConsumedAt  time.Time
	AgentBadge  string
	Description string
}

// IDBadge represents an ID badge issued to an agent.
type IDBadge struct {
	BadgeID   string
	AgentID   string
	IssuedAt  time.Time
	ValidTill time.Time
	ProgramID string
}

// ShipReceipt confirms a spend license consumption.
type ShipReceipt struct {
	ReceiptID   string
	LicenseID   string
	ConsumedAt  time.Time
	ProgramID   string
	Description string
}

// RuntimeManager manages program runtime spend licenses and badges.
type RuntimeManager struct {
	mu            sync.Mutex
	licenses      map[string]*SpendLicense
	badges        map[string]*IDBadge
	receipts      map[string]*ShipReceipt
	monthlyEnvelope float64
	monthlySpent  map[string]float64 // programID -> spent amount
}

// NewRuntimeManager creates a new RuntimeManager with a monthly spend envelope.
func NewRuntimeManager(monthlyEnvelope float64) *RuntimeManager {
	return &RuntimeManager{
		licenses:       make(map[string]*SpendLicense),
		badges:         make(map[string]*IDBadge),
		receipts:       make(map[string]*ShipReceipt),
		monthlyEnvelope: monthlyEnvelope,
		monthlySpent:   make(map[string]float64),
	}
}

// ReserveSpendLicense reserves a spend license for a program if within envelope.
func (rm *RuntimeManager) ReserveSpendLicense(programID, licenseID, description string, amount float64) (*SpendLicense, error) {
	rm.mu.Lock()
	defer rm.mu.Unlock()

	spent := rm.monthlySpent[programID]
	if spent+amount > rm.monthlyEnvelope {
		return nil, fmt.Errorf("monthly spend envelope exceeded for program %s", programID)
	}

	if _, exists := rm.licenses[licenseID]; exists {
		return nil, errors.New("license ID already exists")
	}

	license := &SpendLicense{
		ID:          licenseID,
		ProgramID:   programID,
		Amount:      amount,
		ReservedAt:  time.Now(),
		Consumed:    false,
		Description: description,
	}
	rm.licenses[licenseID] = license
	return license, nil
}

// IssueIDBadge issues an ID badge to an agent for a program.
func (rm *RuntimeManager) IssueIDBadge(badgeID, agentID, programID string, validDuration time.Duration) (*IDBadge, error) {
	rm.mu.Lock()
	defer rm.mu.Unlock()

	if _, exists := rm.badges[badgeID]; exists {
		return nil, errors.New("badge ID already exists")
	}

	badge := &IDBadge{
		BadgeID:   badgeID,
		AgentID:   agentID,
		IssuedAt:  time.Now(),
		ValidTill: time.Now().Add(validDuration),
		ProgramID: programID,
	}
	rm.badges[badgeID] = badge
	return badge, nil
}

// AcceptSpendLicense consumes the spend license and generates a ship receipt.
func (rm *RuntimeManager) AcceptSpendLicense(licenseID, badgeID string) (*ShipReceipt, error) {
	rm.mu.Lock()
	defer rm.mu.Unlock()

	license, ok := rm.licenses[licenseID]
	if !ok {
		return nil, errors.New("license not found")
	}
	if license.Consumed {
		return nil, errors.New("license already consumed")
	}

	badge, ok := rm.badges[badgeID]
	if !ok {
		return nil, errors.New("badge not found")
	}
	if badge.ProgramID != license.ProgramID {
		return nil, errors.New("badge program mismatch")
	}
	if time.Now().After(badge.ValidTill) {
		return nil, errors.New("badge expired")
	}

	// Consume license
	license.Consumed = true
	license.ConsumedAt = time.Now()
	license.AgentBadge = badgeID

	// Update spent amount
	rm.monthlySpent[license.ProgramID] += license.Amount

	// Generate ship receipt
	receiptID := fmt.Sprintf("receipt-%s-%d", licenseID, time.Now().UnixNano())
	receipt := &ShipReceipt{
		ReceiptID:   receiptID,
		LicenseID:   licenseID,
		ConsumedAt:  license.ConsumedAt,
		ProgramID:   license.ProgramID,
		Description: license.Description,
	}
	rm.receipts[receiptID] = receipt

	return receipt, nil
}

// LandingWriteback simulates landing and writing back the program runtime state.
func (rm *RuntimeManager) LandingWriteback(programID string) error {
	// For this lean Arena implementation, we simulate landing by logging.
	// In a real system, this would persist state changes and notify other components.
	rm.mu.Lock()
	defer rm.mu.Unlock()

	// Example: just print summary for now
	spent := rm.monthlySpent[programID]
	fmt.Printf("Landing and writeback for program %s: total spent this month: $%.2f\n", programID, spent)
	return nil
}
