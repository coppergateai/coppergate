package programruntime

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
)

// IDBadge uniquely identifies a program runtime operation.
type IDBadge struct {
	ID string
}

// NewIDBadge generates a new unique ID badge.
func NewIDBadge() IDBadge {
	b := make([]byte, 16)
	_, err := rand.Read(b)
	if err != nil {
		// fallback to a fixed ID on error (should be rare)
		return IDBadge{ID: "00000000000000000000000000000000"}
	}
	return IDBadge{ID: hex.EncodeToString(b)}
}

// Validate checks if the IDBadge is valid.
func (b IDBadge) Validate() error {
	if len(b.ID) != 32 {
		return errors.New("invalid badge ID length")
	}
	return nil
}
