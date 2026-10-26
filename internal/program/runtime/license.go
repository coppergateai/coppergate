package runtime

import (
	"errors"
	"sync"
	"time"
)

// MonthlySpendEnvelope defines the max spend allowed per program per month.
const MonthlySpendEnvelope = 8.00

// IDBadge represents a unique program identity badge.
type IDBadge struct {
	ProgramID string
	IssuedAt  time.Time
	Valid     bool
}

// SpendLicense represents a spend license reserved for a program runtime.
type SpendLicense struct {
	Badge       IDBadge
	ReservedAt  time.Time
	Amount      float64
	Consumed    float64
	ShipReceipt *ShipReceipt
	mu          sync.Mutex
}

// ShipReceipt confirms the allocation of a spend license.
type ShipReceipt struct {
	LicenseID string
	IssuedAt  time.Time
	Amount    float64
}

// LicenseManager manages spend licenses and ID badges.
type LicenseManager struct {
	mu            sync.Mutex
	badges        map[string]IDBadge
	licenses      map[string]*SpendLicense
	monthlySpend  map[string]float64
	currentMonth  time.Time
}

// NewLicenseManager creates a new LicenseManager instance.
func NewLicenseManager() *LicenseManager {
	return &LicenseManager{
		badges:       make(map[string]IDBadge),
		licenses:     make(map[string]*SpendLicense),
		monthlySpend: make(map[string]float64),
		currentMonth: time.Now().Truncate(30 * 24 * time.Hour),
	}
}

// IssueIDBadge issues a new ID badge for a program.
func (lm *LicenseManager) IssueIDBadge(programID string) IDBadge {
	lm.mu.Lock()
	defer lm.mu.Unlock()

	badge := IDBadge{
		ProgramID: programID,
		IssuedAt:  time.Now(),
		Valid:     true,
	}
	lm.badges[programID] = badge
	return badge
}

// ReserveSpendLicense reserves a spend license for a program if within monthly envelope.
func (lm *LicenseManager) ReserveSpendLicense(programID string, amount float64) (*SpendLicense, error) {
	lm.mu.Lock()
	defer lm.mu.Unlock()

	now := time.Now()
	if now.Sub(lm.currentMonth) > 30*24*time.Hour {
		// Reset monthly spend tracking for new month
		lm.monthlySpend = make(map[string]float64)
		lm.currentMonth = now.Truncate(30 * 24 * time.Hour)
	}

	badge, ok := lm.badges[programID]
	if !ok || !badge.Valid {
		return nil, errors.New("invalid or missing ID badge")
	}

	spent := lm.monthlySpend[programID]
	if spent+amount > MonthlySpendEnvelope {
		return nil, errors.New("monthly spend envelope exceeded")
	}

	license := &SpendLicense{
		Badge:      badge,
		ReservedAt: now,
		Amount:     amount,
		Consumed:   0,
	}
	lm.licenses[programID] = license
	lm.monthlySpend[programID] = spent + amount
	return license, nil
}

// AcceptContract accepts the runtime contract and issues a ship receipt.
func (sl *SpendLicense) AcceptContract() (*ShipReceipt, error) {
	sl.mu.Lock()
	defer sl.mu.Unlock()

	if sl.ShipReceipt != nil {
		return nil, errors.New("contract already accepted")
	}

	receipt := &ShipReceipt{
		LicenseID: sl.Badge.ProgramID,
		IssuedAt:  time.Now(),
		Amount:    sl.Amount,
	}
	sl.ShipReceipt = receipt
	return receipt, nil
}

// ConsumeSpend consumes part of the reserved spend license.
func (sl *SpendLicense) ConsumeSpend(amount float64) error {
	sl.mu.Lock()
	defer sl.mu.Unlock()

	if sl.Consumed+amount > sl.Amount {
		return errors.New("spend license exceeded")
	}
	sl.Consumed += amount
	return nil
}
