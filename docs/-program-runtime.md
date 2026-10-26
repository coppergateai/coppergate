# Program Runtime (Contracted Autonomy)

This document describes the **Program Runtime** capability (P-104) which enables managing spend licenses on reserve/fan-out, handling ID badges, and processing acceptance through to ship receipts.

## Overview

The Program Runtime feature supports:

- **Spend License on Reserve/Fan-out:** Manage and track spend licenses with a monthly envelope of $8.
- **ID Badges:** Assign and validate ID badges for program participants.
- **Accept → Ship Receipt Workflow:** Transition accepted items into shipped receipts with proper logging and writeback.
- **Landing and Writeback:** Landing of program runtime data and writeback to persistent storage.

This capability aligns with the architecture defined in [OPEN_PROGRAM.md](../../coppergate-architecture/docs/OPEN_PROGRAM.md).

## Usage

### Reserve/Fan-out Spend License

The system reserves spend licenses for program runtime operations, ensuring the monthly spend envelope of $8 is not exceeded.

### ID Badges

Each program participant is assigned an ID badge that is validated during runtime operations.

### Accept → Ship Receipt

When a program runtime item is accepted, it transitions to a ship receipt state, confirming the operation's completion.

### Landing + Writeback

Program runtime data is landed and written back to persistent storage under `/docs/-program-runtime`.

## Configuration

- Monthly spend envelope: $8
- ID badges are managed internally and validated on each operation.

## Testing

Unit and integration tests cover:

- Spend license reservation and fan-out logic.
- ID badge assignment and validation.
- Accept to ship receipt transition.
- Landing and writeback operations.

## Changelog

- **v1.0.0** - Initial release of Program Runtime (P-104) capability.

---

For detailed architecture, see [OPEN_PROGRAM.md](../../coppergate-architecture/docs/OPEN_PROGRAM.md).
