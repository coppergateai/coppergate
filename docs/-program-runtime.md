# Program Runtime (Contracted Autonomy) Spend License

This document describes the new P-104 capability for managing Program Runtime spend licenses within the Coppergate platform.

## Overview

P-104 introduces the ability to reserve and fan-out spend licenses for contracted autonomy programs. This includes:

- Reserving spend licenses on program runtime.
- Fan-out of spend licenses to sub-programs or components.
- Issuance and management of ID badges for authorized program entities.
- Acceptance of spend licenses leading to issuance of Ship Receipts.
- Landing and writeback of spend license state under `/docs/-program-runtime`.

This capability aligns with the architecture defined in [OPEN_PROGRAM.md](../coppergate-architecture/docs/OPEN_PROGRAM.md).

## Key Concepts

- **Spend License Reserve/Fan-out**: Programs can reserve a portion of their monthly spend envelope (default $8) and fan it out to sub-programs or components.
- **ID Badges**: Unique identifiers issued to program entities authorized to spend licenses.
- **Accept → Ship Receipt**: Upon acceptance of a spend license, a Ship Receipt is generated to confirm the transaction.
- **Landing + Writeback**: Spend license state is landed under `/docs/-program-runtime` and updated accordingly.

## Usage

### Reserving Spend License

Programs can reserve spend licenses via the runtime API or CLI. The reserved amount is deducted from the monthly envelope.

### Fan-out

Reserved licenses can be fanned out to sub-programs or components, each receiving an ID badge.

### Accepting Spend License

Authorized entities accept spend licenses using their ID badges, triggering the issuance of a Ship Receipt.

### Viewing Spend License State

The current state of spend licenses can be viewed under `/docs/-program-runtime`.

## Example
