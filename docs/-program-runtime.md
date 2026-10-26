# Program Runtime (Contracted Autonomy)

This document describes the Program Runtime capability introduced in P-104, which enables managing spend licenses on reserve/fan-out, handling ID badges, and processing Accept → Ship Receipt transitions.

## Overview

The Program Runtime feature allows programs to:

- Reserve and fan-out spend licenses within a monthly envelope of $8.
- Manage ID badges for program participants.
- Transition accepted program states into shipped receipts.
- Integrate with the primary coppergate runtime environment.
- Provide a landing page and documentation under `/docs/-program-runtime`.

## Key Concepts

### Spend License on Reserve/Fan-out

Programs can reserve spend licenses to allocate funds for contracted autonomy. The system enforces a monthly spend cap of $8 per program envelope.

### ID Badges

ID badges are issued to program participants to authenticate and authorize actions within the runtime.

### Accept → Ship Receipt

When a program state is accepted, it transitions to a shipped receipt state, confirming the action and enabling downstream processing.

## Usage

### Reserving Spend License

Use the `ReserveSpendLicense` API to allocate funds for program execution. The system will reject reservations exceeding the monthly envelope.

### Managing ID Badges

ID badges are automatically issued upon program enrollment. Use the `GetIDBadge` API to retrieve badge information.

### Accepting and Shipping Receipts

Invoke the `AcceptAndShip` method to confirm acceptance and generate a ship receipt.

## Architecture

This feature aligns with the Open IDs architecture described in [coppergate-architecture/docs/OPEN_PROGRAM.md](../coppergate-architecture/docs/OPEN_PROGRAM.md).

## Testing

Automated tests cover spend license reservation, ID badge issuance, and accept-to-ship receipt transitions.

---

_Last updated: P-104 release_
