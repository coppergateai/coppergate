package arena

import (
	"context"
	"errors"
	"sync"
	"time"
)

// ErrInsufficientQuota is returned when quota is insufficient.
var ErrInsufficientQuota = errors.New("insufficient_quota")

// QuotaManager manages quota and signals fail-closed on insufficient quota.
type QuotaManager struct {
	mu           sync.Mutex
	quota        int
	paused       bool
	pauseSignal  chan struct{}
	resumeSignal chan struct{}
}

// NewQuotaManager creates a new QuotaManager with initial quota.
func NewQuotaManager(initialQuota int) *QuotaManager {
	return &QuotaManager{
		quota:        initialQuota,
		pauseSignal:  make(chan struct{}),
		resumeSignal: make(chan struct{}),
	}
}

// Consume attempts to consume n quota units.
// Returns ErrInsufficientQuota if quota is insufficient and pauses Arena.
func (qm *QuotaManager) Consume(n int) error {
	qm.mu.Lock()
	defer qm.mu.Unlock()
	if qm.paused {
		return ErrInsufficientQuota
	}
	if qm.quota < n {
		qm.paused = true
		close(qm.pauseSignal) // signal pause
		return ErrInsufficientQuota
	}
	qm.quota -= n
	return nil
}

// PauseSignal returns a channel that closes when quota is insufficient and Arena is paused.
func (qm *QuotaManager) PauseSignal() <-chan struct{} {
	return qm.pauseSignal
}

// Resume resumes Arena and resets pause signal.
func (qm *QuotaManager) Resume(newQuota int) {
	qm.mu.Lock()
	defer qm.mu.Unlock()
	if qm.paused {
		qm.paused = false
		qm.quota = newQuota
		qm.pauseSignal = make(chan struct{})
	}
}

// IsPaused returns true if Arena is paused due to insufficient quota.
func (qm *QuotaManager) IsPaused() bool {
	qm.mu.Lock()
	defer qm.mu.Unlock()
	return qm.paused
}
