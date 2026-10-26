# Program Runtime (Contracted Autonomy) Spend License

## Overview

This document describes the Program Runtime capability for managing contracted autonomy spend licenses within the Coppergate platform. This feature enables:

- Reserving and fan-out of spend licenses within a program runtime.
- Issuance and management of ID badges for contracted autonomy.
- Acceptance of spend licenses leading to issuance of Ship Receipts.
- Integration with the program runtime lifecycle and writeback to the system.

## Key Concepts

### Spend License Reserve / Fan-out

Spend licenses are reserved upfront within a program runtime to guarantee budget availability. Fan-out allows distributing reserved licenses to sub-components or agents operating under the program.

### ID Badges

ID badges are issued to contracted autonomy agents or components as proof of authorization to spend licenses. These badges are linked to the program runtime and tracked.

### Accept → Ship Receipt

When a contracted autonomy agent accepts a spend license, a Ship Receipt is generated to confirm the transaction and enable downstream processing.

## Usage

### Reserving Spend License

To reserve spend licenses, use the runtime API to allocate the desired amount within the program envelope.

### Issuing ID Badges

ID badges are automatically generated upon reservation and can be queried via the runtime interface.

### Accepting Spend License

Acceptance triggers a Ship Receipt creation, which can be retrieved for audit and reconciliation.

## Architecture

This capability aligns with the Open Program architecture as defined in [OPEN_PROGRAM.md](../coppergate-architecture/docs/OPEN_PROGRAM.md). It leverages the lean Arena runtime model and respects the $8 monthly envelope spend cap.

## Testing and Validation

Unit and integration tests cover:

- License reservation and fan-out logic.
- ID badge issuance and validation.
- Accept → Ship Receipt flow.

## Change History

- **P-104**: Initial implementation of Program Runtime Spend License with contracted autonomy support.

---

For detailed API usage and examples, refer to the Coppergate primary repo source code and tests.
