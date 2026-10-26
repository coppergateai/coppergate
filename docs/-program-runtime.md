# Program Runtime (Contracted Autonomy) Spend License

This document describes the Program Runtime capability introduced in P-104, which enables contracted autonomy spend license management on reserve/fan-out operations, ID badges issuance, and acceptance workflows leading to ship receipts.

## Overview

The Program Runtime feature allows programs to:

- Reserve and fan-out spend licenses within a monthly $8 envelope.
- Issue ID badges to authorize contracted autonomy operations.
- Accept spend license usage and generate ship receipts.
- Integrate with the existing architecture Open IDs as specified in [OPEN_PROGRAM.md](../coppergate-architecture/docs/OPEN_PROGRAM.md).

## Key Concepts

- **Spend License**: A license representing a budgeted spend amount reserved for program runtime operations.
- **Reserve/Fan-out**: The process of reserving a portion of the spend license and distributing it to sub-operations or agents.
- **ID Badges**: Digital credentials issued to authorize contracted autonomy agents.
- **Accept → Ship Receipt**: Workflow to accept the usage of spend license and generate a receipt confirming the transaction.

## Usage

### Reserving Spend License

Programs can reserve a portion of their monthly $8 envelope spend license for runtime operations. The system ensures that the total spend does not exceed the envelope.

### Fan-out

Reserved spend licenses can be fanned out to multiple agents or sub-operations, each receiving an ID badge authorizing their autonomy within the spend limits.

### Accept and Ship Receipt

Once operations complete, the spend license usage is accepted, and a ship receipt is generated to confirm the transaction and update program state.

## Architecture Alignment

This feature aligns with the Open IDs and architecture principles described in the coppergate-architecture repository, ensuring secure, auditable, and scalable spend license management.

## Testing

The feature is covered by unit and integration tests validating:

- Correct reservation and fan-out of spend licenses.
- Proper issuance and validation of ID badges.
- Accurate acceptance and ship receipt generation.

## Changelog

- Added Program Runtime spend license management with reserve/fan-out.
- Implemented ID badges issuance and acceptance workflows.
- Integrated ship receipt generation on acceptance.
