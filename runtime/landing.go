package runtime

import (
	"errors"
)

// LandingState holds the runtime state including spend license and receipts.
type LandingState struct {
	SpendLicense *SpendLicense
	Receipts     []*ShipReceipt
}

// NewLandingState creates a new landing state with a spend license envelope.
func NewLandingState(monthlyEnvelope float64) *LandingState {
	return &LandingState{
		SpendLicense: NewSpendLicense(monthlyEnvelope),
		Receipts:     []*ShipReceipt{},
	}
}

// WritebackReceipt adds a ship receipt to the landing state.
func (ls *LandingState) WritebackReceipt(receipt *ShipReceipt) error {
	if receipt == nil {
		return errors.New("receipt is nil")
	}
	ls.Receipts = append(ls.Receipts, receipt)
	return nil
}
