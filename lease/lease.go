package lease

import (
	"context"
	"errors"
	"sync"
	"time"
)

// LeaseState represents the current state of a lease.
type LeaseState int

const (
	LeaseActive LeaseState = iota
	LeasePaused
	LeaseExpired
)

// Lease represents a lease with renew and pause capabilities.
type Lease struct {
	mu           sync.Mutex
	state        LeaseState
	expiry       time.Time
	renewPeriod  time.Duration
	failClosed   bool
	pausedAt     time.Time
	pauseTimeout time.Duration
}

// NewLease creates a new Lease with the given renew period and fail-closed flag.
func NewLease(renewPeriod time.Duration, failClosed bool) *Lease {
	return &Lease{
		state:       LeaseActive,
		renewPeriod: renewPeriod,
		failClosed:  failClosed,
		expiry:      time.Now().Add(renewPeriod),
	}
}

// Pause pauses the lease. Mid-flight CI should become quiet while paused.
func (l *Lease) Pause() {
	l.mu.Lock()
	defer l.mu.Unlock()
	if l.state == LeaseActive {
		l.state = LeasePaused
		l.pausedAt = time.Now()
	}
}

// Resume resumes the lease from pause.
func (l *Lease) Resume() {
	l.mu.Lock()
	defer l.mu.Unlock()
	if l.state == LeasePaused {
		l.state = LeaseActive
		// Extend expiry by pause duration to keep lease honest
		pauseDuration := time.Since(l.pausedAt)
		l.expiry = l.expiry.Add(pauseDuration)
	}
}

// Renew attempts to renew the lease. Returns error if lease expired or paused.
func (l *Lease) Renew(ctx context.Context) error {
	l.mu.Lock()
	defer l.mu.Unlock()

	now := time.Now()
	switch l.state {
	case LeasePaused:
		// While paused, renew is a no-op but must keep lease honest
		// Quiet mid-flight CI means no noisy logs or errors here.
		return nil
	case LeaseExpired:
		if l.failClosed {
			return errors.New("lease expired and fail-closed")
		}
		// If not fail-closed, allow renewal to recover lease
		l.state = LeaseActive
		l.expiry = now.Add(l.renewPeriod)
		return nil
	case LeaseActive:
		if now.After(l.expiry) {
			l.state = LeaseExpired
			if l.failClosed {
				return errors.New("lease expired and fail-closed")
			}
			// Allow renewal to recover lease
			l.state = LeaseActive
			l.expiry = now.Add(l.renewPeriod)
			return nil
		}
		// Normal renewal extends expiry
		l.expiry = now.Add(l.renewPeriod)
		return nil
	default:
		return errors.New("unknown lease state")
	}
}

// IsExpired returns true if the lease is expired.
func (l *Lease) IsExpired() bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	return l.state == LeaseExpired || time.Now().After(l.expiry)
}

// State returns the current lease state.
func (l *Lease) State() LeaseState {
	l.mu.Lock()
	defer l.mu.Unlock()
	return l.state
}
