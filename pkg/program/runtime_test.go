package program

import (
	"testing"
)

func TestReserveSpend(t *testing.T) {
	pr := NewProgramRuntime()

	err := pr.ReserveSpend(5)
	if err != nil {
		t.Fatalf("expected no error reserving spend, got %v", err)
	}

	if pr.GetSpendReserved() != 5 {
		t.Fatalf("expected reserved spend 5, got %v", pr.GetSpendReserved())
	}

	err = pr.ReserveSpend(4)
	if err == nil {
		t.Fatalf("expected error reserving spend exceeding envelope, got none")
	}

	err = pr.ReserveSpend(-1)
	if err == nil {
		t.Fatalf("expected error reserving negative spend, got none")
	}
}

func TestIssueIDBadge(t *testing.T) {
	pr := NewProgramRuntime()

	badge, err := pr.IssueIDBadge("agent123")
	if err != nil {
		t.Fatalf("expected no error issuing badge, got %v", err)
	}

	if badge.AgentID != "agent123" {
		t.Errorf("expected agentID 'agent123', got %s", badge.AgentID)
	}

	if !pr.IsBadgeValid(badge.BadgeID) {
		t.Errorf("expected badge to be valid")
	}

	_, err = pr.IssueIDBadge("")
	if err == nil {
		t.Errorf("expected error issuing badge with empty agentID, got none")
	}
}

func TestAcceptContract(t *testing.T) {
	pr := NewProgramRuntime()

	receipt, err := pr.AcceptContract("contractABC")
	if err != nil {
		t.Fatalf("expected no error accepting contract, got %v", err)
	}

	if receipt.ContractID != "contractABC" {
		t.Errorf("expected contractID 'contractABC', got %s", receipt.ContractID)
	}

	storedReceipt, exists := pr.GetShipReceipt(receipt.ReceiptID)
	if !exists {
		t.Errorf("expected receipt to be stored")
	}

	if storedReceipt.ReceiptID != receipt.ReceiptID {
		t.Errorf("expected receipt IDs to match")
	}

	_, err = pr.AcceptContract("")
	if err == nil {
		t.Errorf("expected error accepting contract with empty ID, got none")
	}
}
