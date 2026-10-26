package runtime

import (
	"testing"
)

func TestAcceptContract(t *testing.T) {
	contractID := "contract-xyz"
	receipt, err := AcceptContract(contractID)
	if err != nil {
		t.Fatalf("AcceptContract failed: %v", err)
	}
	if receipt.ContractID != contractID {
		t.Errorf("Expected ContractID %s, got %s", contractID, receipt.ContractID)
	}
	if receipt.ID == "" {
		t.Error("Expected non-empty receipt ID")
	}
	if receipt.Timestamp.IsZero() {
		t.Error("Expected non-zero timestamp")
	}
}

func TestAcceptContractEmptyID(t *testing.T) {
	_, err := AcceptContract("")
	if err == nil {
		t.Error("Expected error for empty contractID")
	}
}
