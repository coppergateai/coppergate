package runtime

import (
	"testing"
)

func TestLandingStateWritebackReceipt(t *testing.T) {
	ls := NewLandingState(8.0)
	err := ls.SpendLicense.Reserve(3.0)
	if err != nil {
		t.Fatalf("Reserve failed: %v", err)
	}

	receipt, err := AcceptSpendLicense("prog-1", ls.SpendLicense, 3.0)
	if err != nil {
		t.Fatalf("AcceptSpendLicense failed: %v", err)
	}

	err = ls.WritebackReceipt(receipt)
	if err != nil {
		t.Fatalf("WritebackReceipt failed: %v", err)
	}

	if len(ls.Receipts) != 1 {
		t.Fatalf("Receipts length incorrect, got %d want 1", len(ls.Receipts))
	}
	if ls.Receipts[0] != receipt {
		t.Fatal("Receipt in landing state does not match expected")
	}
}
