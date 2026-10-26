# Program Runtime (Contracted Autonomy) Spend License

## Overview

This document describes the Program Runtime feature (P-104) which enables contracted autonomy spend licenses on reserve/fan-out operations, ID badges issuance, and the accept-to-ship receipt workflow.

The feature supports:

- Licensing spend on reserve and fan-out operations within program runtime.
- Issuance and management of ID badges for program participants.
- Transition from Accept state to Ship Receipt state with proper license accounting.
- Landing and writeback of program runtime data under `/docs/-program-runtime`.

## Architecture

This feature aligns with the Open IDs and architecture described in [coppergate-architecture/docs/OPEN_PROGRAM.md](../coppergate-architecture/docs/OPEN_PROGRAM.md).

## Usage

### Reserve/Fan-out Spend License

When a program runtime operation reserves or fans out resources, the spend license is deducted from the contracted autonomy license pool. This ensures that the program does not exceed its $8 monthly envelope.

### ID Badges

ID badges are issued to program participants to authenticate and authorize their actions within the runtime. Badges are required for spend license operations.

### Accept → Ship Receipt Workflow

Upon acceptance of a program runtime operation, the system transitions the state to Ship Receipt, confirming the spend license has been accounted for and the operation is finalized.

## Landing and Writeback

Program runtime data is landed under `/docs/-program-runtime` and includes writeback capabilities to update runtime state and license usage.

## Testing

The feature is covered by unit and integration tests validating:

- Correct spend license deduction on reserve/fan-out.
- Proper issuance and validation of ID badges.
- State transitions from Accept to Ship Receipt.
- Data landing and writeback correctness.

## Change History

- v1.0 (P-104): Initial implementation of Program Runtime Spend License, ID badges, and Accept → Ship Receipt workflow.

---

For detailed API and usage examples, see the code documentation and tests.
