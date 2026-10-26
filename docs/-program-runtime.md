# Program Runtime (Contracted Autonomy)

This document describes the Program Runtime capability introduced in P-104, which enables managing spend licenses on reserve/fan-out, handling ID badges, and accepting program runtime receipts.

## Overview

The Program Runtime feature allows contracted autonomy for programs by managing spend licenses within a monthly envelope of $8. It supports:

- Reserving and fan-out of spend licenses to control program runtime costs.
- Issuance and management of ID badges for program identity and access.
- Accepting runtime receipts to confirm spend and program execution.
- Integration with the primary coppergate repo runtime environment.

## Key Concepts

- **Spend License**: A license representing a monetary spend allocation reserved for program runtime.
- **Reserve/Fan-out**: Mechanism to allocate spend licenses to subprograms or runtime instances.
- **ID Badges**: Digital badges issued to programs for identity and authorization.
- **Accept → Ship Receipt**: Process of accepting runtime spend and shipping a receipt for audit and tracking.

## Usage

### Reserving Spend License

Programs can reserve spend licenses up to the monthly envelope limit ($8). This reservation ensures that runtime costs are controlled and accounted.

### ID Badges

ID badges are issued to programs to verify identity and enable authorized runtime operations.

### Accepting Receipts

Programs accept runtime receipts to confirm spend and execution. Receipts are logged and can be audited.

## Implementation Details

- The feature is implemented in the primary coppergate repository.
- It follows the architecture Open IDs as specified in `coppergate-architecture/docs/OPEN_PROGRAM.md`.
- The runtime environment uses a lean Arena for memory and resource management.
- The monthly envelope is capped at $8 to control spend.

## Testing

Automated tests cover:

- Spend license reservation and fan-out logic.
- ID badge issuance and validation.
- Receipt acceptance and logging.

## Changelog

- Added P-104 Program Runtime capability with spend license management, ID badges, and receipt acceptance.

---

For detailed API and usage examples, refer to the code documentation and tests in the primary coppergate repo.
