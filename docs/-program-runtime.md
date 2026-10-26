# Program Runtime (Contracted Autonomy) Spend License

## Overview

This document describes the Program Runtime capability introduced in P-104, which enables contracted autonomy spend licenses on reserve/fan-out operations. It also covers ID badge issuance, the acceptance flow leading to ship receipts, and the landing and writeback process.

## Key Features

- **Spend License on Reserve/Fan-out**: Programs can now reserve spend licenses for contracted autonomy operations, ensuring controlled and budgeted execution within the $8 monthly envelope.
- **ID Badges**: Unique ID badges are issued to contracted autonomy agents to authenticate and authorize spend operations.
- **Accept → Ship Receipt Flow**: After a contracted autonomy operation is accepted, a ship receipt is generated to confirm the transaction.
- **Landing + Writeback**: Program runtime state changes are landed and written back to the system, ensuring consistency and traceability.

## Architecture Alignment

This capability aligns with the Open IDs architecture described in `coppergate-architecture/docs/OPEN_PROGRAM.md`, ensuring secure and auditable program runtime spend management.

## Usage

1. **Reserve Spend License**: Programs request a spend license for contracted autonomy operations.
2. **Issue ID Badge**: Upon approval, an ID badge is issued to the agent.
3. **Accept Operation**: The agent accepts the operation, triggering the spend license consumption.
4. **Ship Receipt**: A receipt is generated and logged.
5. **Landing and Writeback**: The operation's results are landed and written back to the program runtime state.

## Testing and Validation

This feature is covered by automated tests in the primary coppergate repository, ensuring correctness and adherence to the architecture.

## Change Log

- Added Program Runtime contracted autonomy spend license management.
- Implemented ID badge issuance and acceptance flow.
- Integrated ship receipt generation and landing/writeback process.

---

For detailed API and usage examples, refer to the primary repository source code and tests.
