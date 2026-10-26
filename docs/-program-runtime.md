# Program Runtime (Contracted Autonomy) Spend License

## Overview

This document describes the Program Runtime feature (P-104) that enables contracted autonomy spend licenses on reserve/fan-out operations, ID badge issuance, and the acceptance-to-ship receipt workflow.

The feature is designed to operate within an $8 monthly envelope spend cap and aligns with the architecture outlined in [OPEN_PROGRAM.md](../coppergate-architecture/docs/OPEN_PROGRAM.md).

## Features

- **Spend License on Reserve/Fan-out**  
  Allows programs to reserve and fan-out spend licenses within the contracted autonomy model, ensuring spend limits are respected.

- **ID Badges**  
  Programs can issue and manage ID badges as part of their runtime identity and authorization.

- **Accept → Ship Receipt Workflow**  
  Supports the transition from acceptance of a program action to the generation of a ship receipt, confirming the action's completion.

## Usage

### Reserve/Fan-out Spend License

Programs can request spend licenses on reserve or fan-out operations. The system enforces the $8 monthly spend envelope to prevent overspending.

### ID Badges

ID badges are issued to program runtimes to authenticate and authorize actions. Badge management APIs allow creation, validation, and revocation.

### Accept to Ship Receipt

When a program accepts a contract or action, a ship receipt is generated to confirm the transaction. This receipt can be used for audit and tracking.

## Architecture

This feature follows the Open IDs and program runtime architecture defined in the [OPEN_PROGRAM.md](../coppergate-architecture/docs/OPEN_PROGRAM.md) document.

## Testing

Automated tests cover:

- Spend license enforcement on reserve/fan-out
- ID badge issuance and validation
- Accept to ship receipt workflow correctness

## Change History

- **v1.0** - Initial release of Program Runtime (Contracted Autonomy) Spend License feature.

---

For more details, see the source code and tests in the primary coppergate repository.
