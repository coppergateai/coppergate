package arena

import (
	"context"
	"testing"
	"time"

	"coppergate/missioncontrol"
)

func TestQuotaManager_Consume_PausesOnInsufficientQuota(t *testing.T) {
	qm := NewQuotaManager(5)
	err := qm.Consume(3)
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if qm.IsPaused() {
		t.Fatalf("expected not paused")
	}
	err = qm.Consume(3)
	if err != ErrInsufficientQuota {
		t.Fatalf("expected ErrInsufficientQuota, got %v", err)
	}
	if !qm.IsPaused() {
		t.Fatalf("expected paused")
	}
}

func TestArena_ProcessRequest_PausesOnInsufficientQuota(t *testing.T) {
	mc := missioncontrol.NewSignalController()
	a := NewArena(5, mc)

	// Consume 3 quota, should succeed
	err := a.ProcessRequest(context.Background(), 3)
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if a.quotaManager.IsPaused() {
		t.Fatalf("expected arena not paused")
	}
	if mc.IsPaused() {
		t.Fatalf("expected mission control not paused")
	}

	// Consume 3 quota, should fail and pause both
	err = a.ProcessRequest(context.Background(), 3)
	if err != ErrQuotaExceeded {
		t.Fatalf("expected ErrQuotaExceeded, got %v", err)
	}
	if !a.quotaManager.IsPaused() {
		t.Fatalf("expected arena paused")
	}
	if !mc.IsPaused() {
		t.Fatalf("expected mission control paused")
	}
}

func TestArena_sendSignal_StopsRetryStormOn429(t *testing.T) {
	mc := missioncontrol.NewSignalController()
	a := NewArena(10, mc)

	// Override httpClient to simulate 429 response
	a.httpClient = &mockHTTPClient{
		statusCode: 429,
	}

	err := a.sendSignal(context.Background())
	if err != ErrQuotaExceeded {
		t.Fatalf("expected ErrQuotaExceeded on 429, got %v", err)
	}
	if !mc.IsPaused() {
		t.Fatalf("expected mission control paused on 429")
	}
}

// mockHTTPClient mocks http.Client Do method.
type mockHTTPClient struct {
	statusCode int
}

func (m *mockHTTPClient) Do(req *http.Request) (*http.Response, error) {
	return &http.Response{
		StatusCode: m.statusCode,
		Body:       nopCloser{},
	}, nil
}

type nopCloser struct{}

func (nopCloser) Read([]byte) (int, error) { return 0, nil }
func (nopCloser) Close() error             { return nil }
