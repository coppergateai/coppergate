# Program Runtime (Contracted Autonomy) Spend License

## Overview

This document describes the Program Runtime capability (P-104) which enables contracted autonomy spend licenses on reserve/fan-out operations, ID badges issuance, and the acceptance flow leading to ship receipts.

The feature is designed to operate within an $8 monthly envelope and aligns with the architecture defined in [OPEN_PROGRAM.md](../coppergate-architecture/docs/OPEN_PROGRAM.md).

## Key Features

- **Spend License on Reserve/Fan-out**  
  The system now tracks and enforces spend licenses during reserve and fan-out operations, ensuring that program runtime costs are accounted for and limited within the contracted envelope.

- **ID Badges**  
  ID badges are issued to program runtime entities to authenticate and authorize spend operations.

- **Accept → Ship Receipt Flow**  
  The acceptance of program runtime spend leads to the generation of a ship receipt, confirming the transaction and updating the runtime state accordingly.

## Usage

### Reserve/Fan-out with Spend License

When a program runtime requests resources or fan-out, the spend license is checked and decremented accordingly. If the spend limit is exceeded, the operation is rejected.

### ID Badges

ID badges are issued and must be presented during spend operations. They serve as proof of authorization.

### Accept and Ship Receipt

Upon acceptance of a spend operation, a ship receipt is generated and recorded. This receipt can be queried for audit and reconciliation.

## Architecture

This feature follows the Open IDs and program runtime architecture as specified in the [OPEN_PROGRAM.md](../coppergate-architecture/docs/OPEN_PROGRAM.md).

## Testing

Unit and integration tests cover:

- Spend license enforcement on reserve and fan-out  
- ID badge issuance and validation  
- Accept to ship receipt flow and state updates

## Change History

- **v1.0.0** — Initial release of Program Runtime Spend License capability (P-104).

---

For more details, see the source code and tests in the primary coppergate repository.
