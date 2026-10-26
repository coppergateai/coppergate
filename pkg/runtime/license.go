package runtime

import (
	"errors"
	"fmt"
	"sync"
)

// Constants for spend limits
const (
	MonthlyEnvelopeCap = 8.0
)

// IDBadge represents an authorization badge for a runtime component.
type IDBadge struct {
	ComponentID string
	Amount      float64
}

// ShipReceipt confirms the acceptance and spend of a runtime contract.
type ShipReceipt struct {
	ComponentID string
	Amount      float64
	Timestamp   int64
}

// ProgramLicense manages spend license reservations and fan-out for a program.
type ProgramLicense struct {
	mu              sync.Mutex
	ProgramID       string
	ReservedAmount  float64
	FannedOutAmount float64
	Badges          map[string]IDBadge
}

// NewProgramLicense creates a new ProgramLicense instance.
func NewProgramLicense(programID string) *ProgramLicense {
	return &ProgramLicense{
		ProgramID: programID,
		Badges:    make(map[string]IDBadge),
	}
}

// ReserveLicense reserves an amount from the monthly envelope for the program.
func (pl *ProgramLicense) ReserveLicense(amount float64) error {
	pl.mu.Lock()
	defer pl.mu.Unlock()

	if amount <= 0 {
		return errors.New("reserve amount must be positive")
	}
	if pl.ReservedAmount+amount > MonthlyEnvelopeCap {
		return fmt.Errorf("reserve amount exceeds monthly envelope cap of $%.2f", MonthlyEnvelopeCap)
	}

	pl.ReservedAmount += amount
	return nil
}

// FanOutLicense fans out a portion of the reserved license to a runtime component.
func (pl *ProgramLicense) FanOutLicense(componentID string, amount float64) (IDBadge, error) {
	pl.mu.Lock()
	defer pl.mu.Unlock()

	if amount <= 0 {
		return IDBadge{}, errors.New("fan-out amount must be positive")
	}
	if pl.FannedOutAmount+amount > pl.ReservedAmount {
		return IDBadge{}, errors.New("fan-out amount exceeds reserved license")
	}
	if _, exists := pl.Badges[componentID]; exists {
		return IDBadge{}, errors.New("component already has an ID badge")
	}

	badge := IDBadge{
		ComponentID: componentID,
		Amount:      amount,
	}
	pl.Badges[componentID] = badge
	pl.FannedOutAmount += amount
	return badge, nil
}

// AcceptContract accepts the contract for a component and generates a ShipReceipt.
func (pl *ProgramLicense) AcceptContract(componentID string) (ShipReceipt, error) {
	pl.mu.Lock()
	defer pl.mu.Unlock()

	badge, exists := pl.Badges[componentID]
	if !exists {
		return ShipReceipt{}, errors.New("no ID badge found for component")
	}

	// For simplicity, use Unix timestamp as int64
	receipt := ShipReceipt{
		ComponentID: componentID,
		Amount:      badge.Amount,
		Timestamp:   nowUnix(),
	}

	// Remove badge and reduce fanned out amount to prevent double spend
	delete(pl.Badges, componentID)
	pl.FannedOutAmount -= badge.Amount

	return receipt, nil
}

// nowUnix returns the current Unix timestamp in seconds.
// This is a variable for test override.
var nowUnix = func() int64 {
	return 0 // placeholder, overridden in tests
}
