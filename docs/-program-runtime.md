# Program Runtime (Contracted Autonomy) Spend License

## Overview

The Program Runtime feature enables contracted autonomy spend licenses to be reserved and fan-out managed during program execution. This includes:

- Reserving spend licenses on program runtime for contracted autonomy.
- Managing ID badges for authorization and tracking.
- Accepting spend license usage and generating ship receipts.
- Landing spend license usage data and writing back to the system.

This feature aligns with the architecture defined in [OPEN_PROGRAM.md](../coppergate-architecture/docs/OPEN_PROGRAM.md) and operates within the $8 monthly spend envelope.

## Key Concepts

- **Spend License Reserve/Fan-out**: The system reserves a portion of the contracted autonomy spend license during runtime and fans out usage to subcomponents or tasks.
- **ID Badges**: Unique identifiers issued to runtime components to authenticate and authorize spend license consumption.
- **Accept → Ship Receipt**: Once spend license usage is accepted, a ship receipt is generated to confirm the transaction.
- **Landing + Writeback**: Usage data is landed into the system and written back to update the spend license state.

## Usage

1. When a program runtime starts, it reserves a spend license from the contracted autonomy pool.
2. ID badges are issued to runtime components to track spend usage.
3. Components consume spend licenses and accept usage, triggering ship receipts.
4. Usage data is landed and written back to update the license state and maintain accurate accounting.

## Configuration

- The monthly spend envelope is capped at $8.
- Spend license reservations and fan-out are managed automatically by the runtime.
- ID badges are managed internally and are not user-configurable.

## See Also

- [OPEN_PROGRAM.md](../coppergate-architecture/docs/OPEN_PROGRAM.md)
- [Spend License Management](./-spend-license.md)
