# Program Runtime (Contracted Autonomy) Spend License

## Overview

The Program Runtime feature enables contracted autonomy spend licenses to be reserved and fan-out managed within the system. This includes:

- Reserving spend licenses on program runtime execution.
- Managing ID badges for authorization and tracking.
- Accepting program runtime execution results and generating ship receipts.
- Landing program runtime data and performing writeback operations.

This feature aligns with the architecture defined in [OPEN_PROGRAM.md](../coppergate-architecture/docs/OPEN_PROGRAM.md) and operates within the $8 monthly spend envelope.

## Key Concepts

### Spend License Reserve / Fan-out

When a program runtime is executed, a spend license is reserved to cover the cost of the runtime. The system supports fan-out scenarios where multiple spend licenses may be reserved concurrently for parallel or distributed execution.

### ID Badges

ID badges are issued to runtime instances to authenticate and track their execution and spend license usage.

### Accept → Ship Receipt

Upon successful completion of a program runtime, the system accepts the results and issues a ship receipt. This receipt confirms the spend license consumption and finalizes the transaction.

### Landing + Writeback

Program runtime data is landed into the system's storage and writeback operations update the state accordingly.

## Usage

1. **Reserve Spend License**: The runtime requests a spend license reservation before execution.
2. **Obtain ID Badge**: The runtime instance receives an ID badge for authorization.
3. **Execute Program Runtime**: The program runs under the contracted autonomy.
4. **Accept Results**: The system accepts the runtime results and issues a ship receipt.
5. **Landing and Writeback**: The runtime data is landed and state is updated.

## Architecture Alignment

This feature implements the Open IDs and spend license management as specified in the architecture document:

- Open IDs for runtime instances.
- Spend license reservation and fan-out.
- Receipt issuance on acceptance.
- Landing and writeback mechanisms.

## Limitations

- The monthly spend envelope is capped at $8.
- Only lean Arena runtime environments are supported currently.

## See Also

- [OPEN_PROGRAM.md](../coppergate-architecture/docs/OPEN_PROGRAM.md)
- [CHANGELOG.md](../CHANGELOG.md)

---

*This document is part of the P-104 Program Runtime feature implementation.*
