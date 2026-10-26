// Package arena provides a lean memory arena allocator optimized for low-cost micros under tight budgets.
package arena

import (
	"errors"
	"sync"
)

// ErrFullArena indicates the arena is full and cannot allocate more memory.
var ErrFullArena = errors.New("arena: full arena - allocation denied under tight budget")

// Arena represents a lean memory arena allocator with a fixed budget.
type Arena struct {
	mu       sync.Mutex
	capacity int     // total capacity in bytes
	used     int     // bytes used
	buffer   []byte  // underlying buffer
}

// New creates a new lean Arena with the given capacity in bytes.
// Capacity must be positive and under the $8 monthly budget equivalent in bytes (e.g. 8MB).
func New(capacity int) *Arena {
	if capacity <= 0 {
		panic("arena: capacity must be positive")
	}
	return &Arena{
		capacity: capacity,
		buffer:   make([]byte, capacity),
	}
}

// Alloc allocates a slice of size bytes from the arena.
// Returns ErrFullArena if allocation exceeds capacity.
func (a *Arena) Alloc(size int) ([]byte, error) {
	a.mu.Lock()
	defer a.mu.Unlock()

	if size <= 0 {
		return nil, errors.New("arena: allocation size must be positive")
	}

	if a.used+size > a.capacity {
		// Under tight budget, do not spawn full arena allocations beyond capacity.
		return nil, ErrFullArena
	}

	mem := a.buffer[a.used : a.used+size]
	a.used += size
	return mem, nil
}

// Reset clears the arena for reuse.
func (a *Arena) Reset() {
	a.mu.Lock()
	defer a.mu.Unlock()
	a.used = 0
}
