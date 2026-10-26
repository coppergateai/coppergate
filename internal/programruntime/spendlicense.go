package programruntime

import (
	"errors"
	"sync"
)

// SpendLicense represents a spend license with a monthly envelope and reserved amount.
type SpendLicense struct {
	MonthlyEnvelopeCents int64 // e.g. 800 cents = $8.00
	ReservedCents        int64
	mu                   sync.Mutex
}

// NewSpendLicense creates a new SpendLicense with the given monthly envelope.
func NewSpendLicense(monthlyEnvelopeCents int64) *SpendLicense {
	return &SpendLicense{
		MonthlyEnvelopeCents: monthlyEnvelopeCents,
		ReservedCents:        0,
	}
}

// Reserve attempts to reserve the specified amount of cents from the envelope.
// Returns an error if insufficient funds.
func (sl *SpendLicense) Reserve(amountCents int64) error {
	sl.mu.Lock()
	defer sl.mu.Unlock()

	if amountCents <= 0 {
		return errors.New("reserve amount must be positive")
	}

	if sl.ReservedCents+amountCents > sl.MonthlyEnvelopeCents {
		return errors.New("insufficient funds in spend license envelope")
	}

	sl.ReservedCents += amountCents
	return nil
}

// FanOut distributes reserved spend license to multiple agents.
// The sum of fanOutAmounts must not exceed ReservedCents.
func (sl *SpendLicense) FanOut(fanOutAmounts []int64) error {
	sl.mu.Lock()
	defer sl.mu.Unlock()

	var total int64
	for _, amt := range fanOutAmounts {
		if amt <= 0 {
			return errors.New("fan-out amounts must be positive")
		}
		total += amt
	}

	if total > sl.ReservedCents {
		return errors.New("fan-out amounts exceed reserved spend license")
	}

	// Deduct the fan-out amounts from reserved
	sl.ReservedCents -= total
	return nil
}

// IDBadge represents an ID badge issued to an agent for autonomy authorization.
type IDBadge struct {
	AgentID string
	Amount  int64 // spend license amount authorized
	Valid   bool
}

// AcceptUsage accepts usage of spend license and returns a ShipReceipt.
func (sl *SpendLicense) AcceptUsage(amountCents int64) (*ShipReceipt, error) {
	sl.mu.Lock()
	defer sl.mu.Unlock()

	if amountCents <= 0 {
		return nil, errors.New("accept amount must be positive")
	}

	if amountCents > sl.MonthlyEnvelopeCents {
		return nil, errors.New("accept amount exceeds monthly envelope")
	}

	// For simplicity, assume acceptance reduces the monthly envelope.
	sl.MonthlyEnvelopeCents -= amountCents

	receipt := &ShipReceipt{
		AmountCents: amountCents,
		ReceiptID:   generateReceiptID(),
	}

	return receipt, nil
}

// ShipReceipt represents a receipt generated after accepting spend license usage.
type ShipReceipt struct {
	AmountCents int64
	ReceiptID   string
}

// generateReceiptID generates a unique receipt ID.
// In production, this would be a UUID or similar.
func generateReceiptID() string {
	// For demonstration, use a simple counter or timestamp.
	// Here we use a static string for simplicity.
	return "SHIP-RECEIPT-0001"
}
