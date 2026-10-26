# Program Runtime (Contracted Autonomy) Spend License

## Overview

This document describes the Program Runtime feature (P-104) which enables contracted autonomy spend licenses on reserve/fan-out operations. It introduces ID badges for program identity and a new acceptance flow from Accept → Ship Receipt.

This feature is designed to operate within the $8 monthly envelope spend cap and aligns with the architecture defined in [OPEN_PROGRAM.md](../coppergate-architecture/docs/OPEN_PROGRAM.md).

## Key Features

- **Spend License on Reserve/Fan-out**: Programs can reserve spend licenses for runtime autonomy, ensuring controlled spend within the monthly envelope.
- **ID Badges**: Unique program identity badges are issued and validated during runtime operations.
- **Accept → Ship Receipt Flow**: After acceptance, programs receive a ship receipt confirming the spend license allocation and runtime authorization.
- **Landing + Writeback**: Runtime spend license state is landed and written back to persistent storage for audit and reconciliation.

## Usage

1. **Reserve Spend License**  
   Programs request a spend license for runtime autonomy. The system verifies the request against the $8 monthly envelope and issues a license if available.

2. **ID Badge Validation**  
   Each program runtime operation must present a valid ID badge. The badge is checked against the Open IDs registry.

3. **Accept and Ship Receipt**  
   Upon acceptance of the spend license, a ship receipt is generated and returned to the program. This receipt serves as proof of authorization.

4. **Landing and Writeback**  
   The runtime spend license usage is landed into the system and written back to persistent storage to maintain accurate spend accounting.

## Architecture

This feature integrates with the primary coppergate repo and follows the Open IDs architecture as specified in `coppergate-architecture/docs/OPEN_PROGRAM.md`.

## Testing

The feature is covered by unit and integration tests validating spend license reservation, ID badge issuance and validation, acceptance flow, and landing/writeback operations.

## Change Log

- Added Program Runtime Spend License capability (P-104)
- Introduced ID badges for program identity
- Implemented Accept → Ship Receipt flow
- Added landing and writeback of spend license state

---

For detailed API usage and examples, refer to the code documentation.
