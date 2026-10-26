# Program Runtime (Contracted Autonomy) Spend License

## Overview

This feature implements the Program Runtime Spend License mechanism, enabling contracted autonomy for program execution spend management. It introduces:

- **Reserve/Fan-out Spend License**: Allows programs to reserve and fan-out spend within a controlled envelope.
- **ID Badges**: Unique identifiers for spend licenses to track and authorize spend.
- **Accept → Ship Receipt Flow**: Programs can accept spend licenses and produce ship receipts as proof of spend.
- **Landing and Writeback**: Spend license state is landed and written back to the system for audit and reconciliation.

## Architecture

This implementation aligns with the Open IDs and architecture described in [coppergate-architecture/docs/OPEN_PROGRAM.md](../coppergate-architecture/docs/OPEN_PROGRAM.md).

## Usage

1. **Reserve Spend License**

   Programs can reserve spend licenses up to an $8 monthly envelope.

2. **Fan-out**

   Reserved spend licenses can be fanned out to sub-programs or components, each with their own ID badges.

3. **Accept and Ship**

   Upon acceptance of a spend license, a ship receipt is generated and recorded.

4. **Landing and Writeback**

   The spend license state is landed in the system and written back for audit and tracking.

## Testing

This feature is covered by unit and integration tests validating:

- Correct reservation and fan-out of spend licenses.
- Proper issuance and validation of ID badges.
- Acceptance flow producing ship receipts.
- Landing and writeback consistency.

## Changelog

- Added Program Runtime Spend License with reserve/fan-out, ID badges, accept → ship receipt flow, and landing/writeback.
