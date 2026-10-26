# Program Runtime (Contracted Autonomy) Spend License

## Overview

This document describes the Program Runtime (Contracted Autonomy) spend license feature introduced in P-104. This feature enables managing spend licenses on reserve/fan-out operations, handling ID badges for program runtime authorization, and the acceptance flow from license acceptance to ship receipt.

## Key Concepts

- **Spend License on Reserve/Fan-Out**: The system now supports reserving spend licenses when programs fan-out operations, ensuring spend caps are respected and tracked.
- **ID Badges**: Programs receive ID badges representing their runtime authorization and spend license status.
- **Accept → Ship Receipt Flow**: After accepting a spend license, a ship receipt is generated to confirm the transaction and update runtime state.
- **Landing and Writeback**: The runtime landing process integrates spend license state and writes back updated license and receipt information.

## Usage

### Reserving Spend License

When a program runtime initiates a fan-out operation, it reserves spend license tokens from its monthly envelope (default $8). The system ensures spend does not exceed the envelope.

### ID Badges

ID badges are issued and attached to program runtime contexts to authorize spend and operations. These badges are validated during runtime operations.

### Accepting Spend License

Programs must explicitly accept spend licenses before proceeding. Upon acceptance, a ship receipt is generated and recorded.

### Ship Receipt

The ship receipt confirms the spend license transaction and updates the runtime state accordingly.

## Architecture

This feature aligns with the Open IDs architecture described in [coppergate-architecture/docs/OPEN_PROGRAM.md](../coppergate-architecture/docs/OPEN_PROGRAM.md).

## Testing

The feature is covered by unit and integration tests validating:

- Spend license reservation and enforcement
- ID badge issuance and validation
- Accept → Ship Receipt flow correctness
- Landing and writeback of spend license state

## Change History

- P-104: Initial implementation of Program Runtime Spend License on reserve/fan-out, ID badges, and accept to ship receipt flow.

---

For detailed API and implementation notes, see the source code and tests in the primary coppergate repo.
