# Program Runtime (Contracted Autonomy) Spend License

## Overview

This feature introduces the Program Runtime Spend License capability, enabling contracted autonomy for program execution spend management within the coppergate platform.

Key capabilities include:

- **Spend License on Reserve/Fan-out:** Programs can reserve a spend license to manage their runtime costs efficiently within a monthly envelope.
- **ID Badges:** Each program runtime instance is assigned a unique ID badge to track spend and authorization.
- **Accept → Ship Receipt:** Upon acceptance of a spend license reservation, a ship receipt is generated to confirm the transaction.
- **Landing and Writeback:** The spend license state is landed and written back to persistent storage for audit and reconciliation.

This capability aligns with the architecture defined in `coppergate-architecture/docs/OPEN_PROGRAM.md` and operates within an $8 monthly spend envelope.

## Usage

1. **Reserve Spend License**

   Programs request a spend license reservation before runtime execution. The system checks the available envelope and grants a license if sufficient funds remain.

2. **ID Badge Assignment**

   Upon reservation, an ID badge is issued to the runtime instance. This badge is used for tracking and authorization during execution.

3. **Accept and Ship Receipt**

   When the program accepts the license, a ship receipt is generated confirming the spend license allocation.

4. **Landing and Writeback**

   The spend license state is landed in the runtime environment and written back to persistent storage to maintain consistency and enable auditing.

## Configuration

- Monthly spend envelope: $8 (fixed)
- License reservation granularity: per runtime instance
- Badge format: UUID-based unique identifier

## Limitations

- The spend envelope is currently fixed at $8 per month.
- License reservations are atomic and do not support partial reservations.

## See Also

- [OPEN_PROGRAM Architecture](../coppergate-architecture/docs/OPEN_PROGRAM.md)
- [Program Runtime API](../api/program-runtime.md)

---

*This document corresponds to the P-104 feature implementation.*
