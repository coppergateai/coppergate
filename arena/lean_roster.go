package arena

import (
	"errors"
	"sync"
)

// LeanRoster is a memory-lean roster implementation designed to operate under tight budget constraints.
// It supports only Engineer and Reviewer roles, and does not spawn a full arena.
// It is optimized for environments where micros (CPU time) budget is under $2 monthly.
//
// Usage:
//   roster := NewLeanRoster()
//   roster.Add("user1", RoleEngineer)
//   roster.Add("user2", RoleReviewer)
//   roster.Remove("user1")
//   roles := roster.List()
//
// This roster is thread-safe.
type LeanRoster struct {
	mu    sync.RWMutex
	users map[string]Role
}

// Role defines user roles supported by LeanRoster.
type Role int

const (
	RoleUnknown Role = iota
	RoleEngineer
	RoleReviewer
)

// ErrRoleNotSupported is returned when an unsupported role is used.
var ErrRoleNotSupported = errors.New("role not supported in lean roster")

// NewLeanRoster creates a new LeanRoster instance.
func NewLeanRoster() *LeanRoster {
	return &LeanRoster{
		users: make(map[string]Role),
	}
}

// Add adds a user with a given role to the roster.
// Only RoleEngineer and RoleReviewer are supported.
// Returns ErrRoleNotSupported if role is not allowed.
func (r *LeanRoster) Add(userID string, role Role) error {
	if role != RoleEngineer && role != RoleReviewer {
		return ErrRoleNotSupported
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	r.users[userID] = role
	return nil
}

// Remove removes a user from the roster.
func (r *LeanRoster) Remove(userID string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	delete(r.users, userID)
}

// List returns a copy of the current roster as a map of userID to Role.
func (r *LeanRoster) List() map[string]Role {
	r.mu.RLock()
	defer r.mu.RUnlock()
	copyMap := make(map[string]Role, len(r.users))
	for k, v := range r.users {
		copyMap[k] = v
	}
	return copyMap
}
