# Program Runtime (Contracted Autonomy)

This document describes the **Program Runtime** capability introduced in P-104, which enables managing spend licenses on reserve/fan-out, handling ID badges, and processing Accept → Ship Receipt transitions.

## Overview

The Program Runtime feature supports contracted autonomy for program spend management within the coppergate platform. It includes:

- **Spend License on Reserve/Fan-out**: Programs can reserve a spend license to control monthly spend envelopes efficiently.
- **ID Badges**: Unique identifiers for program instances to authenticate and authorize runtime operations.
- **Accept → Ship Receipt Workflow**: Programs can accept a contract and generate a ship receipt as proof of delivery and fulfillment.

This capability aligns with the architecture defined in [OPEN_PROGRAM.md](../coppergate-architecture/docs/OPEN_PROGRAM.md) and is designed to operate within an $8 monthly spend envelope.

## Usage

### Reserving Spend License

Programs can reserve a spend license to allocate funds for runtime operations. This ensures spend is controlled and does not exceed the monthly envelope.

### ID Badges

Each program runtime instance is issued an ID badge that must be presented to perform authorized actions such as accepting contracts or shipping receipts.

### Accept → Ship Receipt

Once a program accepts a contract, it can generate a ship receipt to confirm delivery. This receipt is recorded and can be queried for verification.

## API

The primary API endpoints exposed are:

- `POST /programs/{programID}/reserve`  
  Reserve spend license for the program runtime.

- `POST /programs/{programID}/id-badge`  
  Issue or refresh an ID badge for the program runtime.

- `POST /programs/{programID}/accept`  
  Accept a contract and transition to ship receipt.

- `GET /programs/{programID}/ship-receipt`  
  Retrieve the ship receipt for the accepted contract.

## Implementation Notes

- The spend license reservation enforces the $8 monthly envelope limit.
- ID badges are cryptographically signed tokens with expiration.
- Accept → Ship Receipt transitions are atomic and recorded in the program ledger.

## Testing

Unit and integration tests cover:

- Spend license reservation and enforcement.
- ID badge issuance and validation.
- Accept → Ship Receipt workflow correctness.

## Change Log

- Added Program Runtime capability with spend license, ID badges, and accept → ship receipt workflow (P-104).

---

For detailed architecture and design, see [OPEN_PROGRAM.md](../coppergate-architecture/docs/OPEN_PROGRAM.md).
