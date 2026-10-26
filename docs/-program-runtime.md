# Program Runtime (Contracted Autonomy) Spend License

## Overview

This document describes the Program Runtime feature (P-104) which enables contracted autonomy spend licenses on reserve/fan-out operations. It introduces ID badges for program identity and a new acceptance flow from "Accept" to "Ship Receipt". This feature is designed to work within the $8 monthly spend envelope and aligns with the architecture defined in [OPEN_PROGRAM.md](../coppergate-architecture/docs/OPEN_PROGRAM.md).

## Key Features

- **Spend License on Reserve/Fan-out**  
  Programs can now reserve spend licenses for runtime operations, ensuring controlled and budgeted autonomy spend.

- **ID Badges**  
  Each program runtime instance is assigned an ID badge for identity and authorization purposes.

- **Accept → Ship Receipt Flow**  
  After acceptance of a runtime contract, the system generates a ship receipt to confirm the transaction and update the runtime state.

- **Landing and Writeback**  
  Program runtime state changes are landed and written back to the system, ensuring consistency and traceability.

## Usage

1. **Reserve Spend License**  
   When a program runtime initiates a reserve or fan-out operation, it consumes from its contracted spend license.

2. **ID Badge Assignment**  
   The system issues an ID badge to the runtime instance, which must be presented for subsequent operations.

3. **Accept and Ship Receipt**  
   Upon acceptance of a runtime contract, the system transitions the state and issues a ship receipt as proof.

4. **Landing and Writeback**  
   Runtime state changes are landed into the system and written back to persistent storage.

## Architecture Alignment

This feature follows the Open IDs and program runtime architecture as specified in the [OPEN_PROGRAM.md](../coppergate-architecture/docs/OPEN_PROGRAM.md) document.

## Testing and Validation

- Unit tests cover spend license reservation and consumption logic.
- Integration tests validate the accept → ship receipt flow.
- ID badge issuance and verification are tested for correctness.

## Change Log

- Added Program Runtime Spend License capability with reserve/fan-out support.
- Introduced ID badges for runtime identity.
- Implemented accept to ship receipt transition flow.
- Added landing and writeback mechanisms for runtime state.

---

For detailed API usage and examples, refer to the code documentation and tests in the primary coppergate repository.
