# Program Runtime (Contracted Autonomy) Spend License

## Overview

This document describes the Program Runtime feature (P-104) which enables contracted autonomy spend licenses on reserve/fan-out operations. It introduces ID badges for program identity and a new acceptance flow from "Accept" to "Ship Receipt". This feature is designed to operate within an $8 monthly spend envelope and aligns with the architecture defined in [OPEN_PROGRAM.md](../coppergate-architecture/docs/OPEN_PROGRAM.md).

## Key Features

- **Spend License on Reserve/Fan-out**: Programs can reserve spend licenses to control and limit their runtime spend within the monthly envelope.
- **ID Badges**: Unique program identity badges issued to authorize spend and operations.
- **Accept → Ship Receipt Flow**: Programs can accept a contract and receive a ship receipt confirming the runtime spend license allocation.
- **Landing and Writeback**: Program runtime state lands in the system and writes back spend usage and receipts for audit and control.

## Usage

1. **Reserve Spend License**  
   Programs request a spend license for their runtime operations. The system checks the $8 monthly envelope and grants a license if available.

2. **ID Badge Issuance**  
   Upon license reservation, an ID badge is issued to the program, representing its autonomy and spend rights.

3. **Accept Contract**  
   The program accepts the runtime contract, triggering the issuance of a ship receipt.

4. **Ship Receipt**  
   The ship receipt confirms the spend license allocation and is recorded for auditing.

5. **Runtime Landing and Writeback**  
   Runtime operations land in the system, and spend usage is written back to update the license state.

## Architecture

This feature follows the Open IDs and program runtime architecture described in [OPEN_PROGRAM.md](../coppergate-architecture/docs/OPEN_PROGRAM.md). It integrates with the lean Arena for efficient resource management.

## Limitations

- The monthly spend envelope is capped at $8.
- Only programs with valid ID badges can reserve spend licenses.

## Testing

Automated tests cover license reservation, ID badge issuance, accept-to-ship receipt flow, and spend writeback.

---

*For detailed API and implementation, see the primary coppergate repo source code.*
