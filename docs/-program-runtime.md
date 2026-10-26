# Program Runtime (Contracted Autonomy) Spend License

## Overview

This document describes the Program Runtime (Contracted Autonomy) Spend License feature, also known as P-104. This capability enables the management of spend licenses on reserve/fan-out operations, issuance and validation of ID badges, and the acceptance process leading to a ship receipt.

This feature is designed to operate within the $8 monthly envelope spend cap and aligns with the architecture principles outlined in [OPEN_PROGRAM.md](../coppergate-architecture/docs/OPEN_PROGRAM.md).

## Key Concepts

- **Spend License on Reserve/Fan-out**: Controls and tracks spend licenses when reserving or fan-out operations are performed.
- **ID Badges**: Unique identifiers issued to programs or agents to authenticate and authorize spend license usage.
- **Accept → Ship Receipt**: A workflow where accepted spend licenses generate ship receipts as proof of transaction.
- **Landing + Writeback**: All spend license transactions are landed in the system and written back to ensure consistency and traceability.

## Usage

### Reserve/Fan-out Spend License

When a program requests to reserve or fan-out spend licenses, the system checks the available license balance against the $8 monthly envelope. If sufficient, the license is reserved and an ID badge is issued or validated.

### ID Badges

ID badges are issued to programs or agents to authenticate spend license usage. These badges must be presented during acceptance to generate a ship receipt.

### Accept and Ship Receipt

Upon acceptance of a spend license usage, a ship receipt is generated and recorded. This receipt serves as proof of the transaction and is stored for audit and reconciliation.

## Architecture Alignment

This feature follows the Open IDs and program runtime architecture as specified in the [OPEN_PROGRAM.md](../coppergate-architecture/docs/OPEN_PROGRAM.md).

## Examples
