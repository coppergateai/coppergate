package program

import (
	"encoding/json"
	"errors"
	"fmt"
	"sync"
	"time"
)

// Constants for monthly envelope and default values.
const (
	MonthlyEnvelope = 8.0 // $8 monthly envelope
)

// SpendLicense represents a spend license reservation or fan-out.
type SpendLicense struct {
	ID           string    `json:"id"`
	Amount       float64   `json:"amount"`
	ReservedAt   time.Time `json:"reserved_at"`
	FannedOutTo  string    `json:"fanned_out_to,omitempty"`
	BadgeID      string    `json:"badge_id,omitempty"`
	Accepted     bool      `json:"accepted"`
	ShipReceipt  string    `json:"ship_receipt,omitempty"`
}

// RuntimeSpendManager manages spend licenses for program runtime.
type RuntimeSpendManager struct {
	mu            sync.Mutex
	totalReserved float64
	licenses      map[string]*SpendLicense
}

// NewRuntimeSpendManager creates a new RuntimeSpendManager.
func NewRuntimeSpendManager() *RuntimeSpendManager {
	return &RuntimeSpendManager{
		licenses: make(map[string]*SpendLicense),
	}
}

// ReserveSpend reserves an amount from the monthly envelope.
func (r *RuntimeSpendManager) ReserveSpend(id string, amount float64) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	if amount <= 0 {
		return errors.New("amount must be positive")
	}
	if r.totalReserved+amount > MonthlyEnvelope {
		return fmt.Errorf("reserve amount %.2f exceeds monthly envelope %.2f", r.totalReserved+amount, MonthlyEnvelope)
	}
	if _, exists := r.licenses[id]; exists {
		return fmt.Errorf("license with ID %s already exists", id)
	}

	license := &SpendLicense{
		ID:         id,
		Amount:     amount,
		ReservedAt: time.Now(),
	}
	r.licenses[id] = license
	r.totalReserved += amount
	return nil
}

// FanOutSpend fans out a reserved spend license to a sub-program/component.
func (r *RuntimeSpendManager) FanOutSpend(parentID, fanOutID, to string, amount float64) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	parent, ok := r.licenses[parentID]
	if !ok {
		return fmt.Errorf("parent license %s not found", parentID)
	}
	if parent.Accepted {
		return errors.New("cannot fan-out from accepted license")
	}
	if amount <= 0 || amount > parent.Amount {
		return errors.New("invalid fan-out amount")
	}
	if _, exists := r.licenses[fanOutID]; exists {
		return fmt.Errorf("license with ID %s already exists", fanOutID)
	}

	// Reduce parent amount
	parent.Amount -= amount

	// Create fan-out license with badge ID
	badgeID := fmt.Sprintf("badge-%s", fanOutID)
	fanOutLicense := &SpendLicense{
		ID:          fanOutID,
		Amount:      amount,
		ReservedAt:  time.Now(),
		FannedOutTo: to,
		BadgeID:     badgeID,
	}
	r.licenses[fanOutID] = fanOutLicense
	return nil
}

// AcceptSpend accepts a spend license by badge ID and issues a Ship Receipt.
func (r *RuntimeSpendManager) AcceptSpend(badgeID string) (string, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	for _, license := range r.licenses {
		if license.BadgeID == badgeID {
			if license.Accepted {
				return "", errors.New("license already accepted")
			}
			license.Accepted = true
			receipt := fmt.Sprintf("ship-receipt-%s-%d", license.ID, time.Now().Unix())
			license.ShipReceipt = receipt
			return receipt, nil
		}
	}
	return "", errors.New("badge ID not found")
}

// GetSpendLicenseState returns the JSON representation of all spend licenses.
func (r *RuntimeSpendManager) GetSpendLicenseState() ([]byte, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	return json.MarshalIndent(r.licenses, "", "  ")
}
