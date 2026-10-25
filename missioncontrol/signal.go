package missioncontrol

import (
	"context"
	"sync"
	"time"
)

// SignalController controls signals to Mission Control, including pause on insufficient quota.
type SignalController struct {
	mu          sync.Mutex
	paused      bool
	pauseSignal chan struct{}
}

// NewSignalController creates a new SignalController.
func NewSignalController() *SignalController {
	return &SignalController{
		pauseSignal: make(chan struct{}),
	}
}

// Pause pauses signals due to insufficient quota.
func (sc *SignalController) Pause() {
	sc.mu.Lock()
	defer sc.mu.Unlock()
	if !sc.paused {
		sc.paused = true
		close(sc.pauseSignal)
	}
}

// Resume resumes signals.
func (sc *SignalController) Resume() {
	sc.mu.Lock()
	defer sc.mu.Unlock()
	if sc.paused {
		sc.paused = false
		sc.pauseSignal = make(chan struct{})
	}
}

// PauseSignal returns a channel that closes when paused.
func (sc *SignalController) PauseSignal() <-chan struct{} {
	sc.mu.Lock()
	defer sc.mu.Unlock()
	return sc.pauseSignal
}

// IsPaused returns true if signals are paused.
func (sc *SignalController) IsPaused() bool {
	sc.mu.Lock()
	defer sc.mu.Unlock()
	return sc.paused
}
