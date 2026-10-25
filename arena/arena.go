package arena

import (
	"context"
	"errors"
	"net/http"
	"sync"
	"time"

	"coppergate/missioncontrol"
)

var (
	// ErrQuotaExceeded is returned when quota is insufficient.
	ErrQuotaExceeded = errors.New("insufficient_quota")
)

// Arena represents the main processing unit that consumes quota and sends signals.
type Arena struct {
	quotaManager     *QuotaManager
	missionControl   *missioncontrol.SignalController
	httpClient       *http.Client
	mu               sync.Mutex
	lastQuotaCheck   time.Time
	quotaCheckPeriod time.Duration
}

// NewArena creates a new Arena with given quota and mission control.
func NewArena(initialQuota int, mc *missioncontrol.SignalController) *Arena {
	return &Arena{
		quotaManager:     NewQuotaManager(initialQuota),
		missionControl:   mc,
		httpClient:       &http.Client{},
		quotaCheckPeriod: time.Minute,
	}
}

// ProcessRequest simulates processing a request that consumes quota.
// On insufficient quota, pauses Arena and Mission Control signals.
func (a *Arena) ProcessRequest(ctx context.Context, cost int) error {
	err := a.quotaManager.Consume(cost)
	if err == ErrInsufficientQuota {
		a.pauseAll()
		return ErrQuotaExceeded
	}
	// Simulate sending a signal to Mission Control.
	err = a.sendSignal(ctx)
	if err != nil {
		return err
	}
	return nil
}

func (a *Arena) pauseAll() {
	a.mu.Lock()
	defer a.mu.Unlock()
	a.quotaManager.paused = true
	a.missionControl.Pause()
}

// sendSignal sends a signal to Mission Control, respecting pause state.
func (a *Arena) sendSignal(ctx context.Context) error {
	if a.missionControl.IsPaused() {
		// Fail closed: do not retry 429 storm.
		return ErrQuotaExceeded
	}
	// Simulate HTTP POST to Mission Control endpoint.
	req, err := http.NewRequestWithContext(ctx, "POST", "https://missioncontrol.example.com/signal", nil)
	if err != nil {
		return err
	}
	resp, err := a.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusTooManyRequests {
		// On 429, pause signals to avoid retry storm.
		a.missionControl.Pause()
		return ErrQuotaExceeded
	}
	if resp.StatusCode >= 400 {
		return errors.New("signal send failed")
	}
	return nil
}
