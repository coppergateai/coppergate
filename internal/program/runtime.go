package program

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"time"
)

// Constants for spend envelope and badge expiration.
const (
	MonthlySpendEnvelopeCents = 800 // $8.00 in cents
	IDBadgeValidityDuration   = 24 * time.Hour
)

// ErrSpendLimitExceeded is returned when reservation exceeds monthly envelope.
var ErrSpendLimitExceeded = errors.New("spend license reservation exceeds monthly envelope")

// ErrInvalidBadge is returned when an ID badge is invalid or expired.
var ErrInvalidBadge = errors.New("invalid or expired ID badge")

// ProgramRuntime manages contracted autonomy spend license and ID badges.
type ProgramRuntime struct {
	mu sync.Mutex

	// programID uniquely identifies the program.
	programID string

	// spendReservedCents tracks the reserved spend for the current month.
	spendReservedCents int

	// badge issued for this runtime instance.
	badge *IDBadge

	// accepted indicates if the contract was accepted.
	accepted bool

	// shipReceipt generated after acceptance.
	shipReceipt *ShipReceipt

	// monthStart tracks the start of the current spend month.
	monthStart time.Time
}

// IDBadge represents a program runtime identity badge.
type IDBadge struct {
	Token     string
	ExpiresAt time.Time
}

// ShipReceipt represents a receipt generated after contract acceptance.
type ShipReceipt struct {
	ProgramID string
	Timestamp time.Time
	Details   string
}

// NewProgramRuntime creates a new ProgramRuntime instance.
func NewProgramRuntime(programID string) *ProgramRuntime {
	return &ProgramRuntime{
		programID: programID,
		monthStart: time.Now().Truncate(30 * 24 * time.Hour), // approximate month start
	}
}

// ReserveSpendLicense attempts to reserve spend license cents for the runtime.
// Returns error if reservation exceeds monthly envelope.
func (pr *ProgramRuntime) ReserveSpendLicense(ctx context.Context, cents int) error {
	pr.mu.Lock()
	defer pr.mu.Unlock()

	now := time.Now()
	if now.Sub(pr.monthStart) >= 30*24*time.Hour {
		// Reset monthly spend reservation for new month.
		pr.monthStart = now.Truncate(30 * 24 * time.Hour)
		pr.spendReservedCents = 0
	}

	if pr.spendReservedCents+cents > MonthlySpendEnvelopeCents {
		return ErrSpendLimitExceeded
	}

	pr.spendReservedCents += cents
	return nil
}

// IssueIDBadge issues a new ID badge valid for 24 hours.
func (pr *ProgramRuntime) IssueIDBadge(ctx context.Context) *IDBadge {
	pr.mu.Lock()
	defer pr.mu.Unlock()

	token := fmt.Sprintf("%s-%d", pr.programID, time.Now().UnixNano())
	badge := &IDBadge{
		Token:     token,
		ExpiresAt: time.Now().Add(IDBadgeValidityDuration),
	}
	pr.badge = badge
	return badge
}

// ValidateIDBadge checks if the provided badge token is valid and not expired.
func (pr *ProgramRuntime) ValidateIDBadge(token string) error {
	pr.mu.Lock()
	defer pr.mu.Unlock()

	if pr.badge == nil || pr.badge.Token != token || time.Now().After(pr.badge.ExpiresAt) {
		return ErrInvalidBadge
	}
	return nil
}

// AcceptContract accepts the contract if the badge is valid and not already accepted.
// Generates a ship receipt.
func (pr *ProgramRuntime) AcceptContract(ctx context.Context, badgeToken string) (*ShipReceipt, error) {
	pr.mu.Lock()
	defer pr.mu.Unlock()

	if pr.accepted {
		return nil, errors.New("contract already accepted")
	}

	if pr.badge == nil || pr.badge.Token != badgeToken || time.Now().After(pr.badge.ExpiresAt) {
		return nil, ErrInvalidBadge
	}

	pr.accepted = true
	pr.shipReceipt = &ShipReceipt{
		ProgramID: pr.programID,
		Timestamp: time.Now(),
		Details:   "Contract accepted and shipped",
	}
	return pr.shipReceipt, nil
}

// GetShipReceipt returns the ship receipt if contract was accepted.
func (pr *ProgramRuntime) GetShipReceipt() (*ShipReceipt, error) {
	pr.mu.Lock()
	defer pr.mu.Unlock()

	if !pr.accepted || pr.shipReceipt == nil {
		return nil, errors.New("no ship receipt available")
	}
	return pr.shipReceipt, nil
}
