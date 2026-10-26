# Program Runtime (Contracted Autonomy)

## Overview

The Program Runtime feature enables contracted autonomy spend license management within the Coppergate platform. This includes reserving and fan-out of spend licenses, issuance and verification of ID badges, and the acceptance flow culminating in a Ship Receipt.

This feature is designed to operate within a monthly spend envelope of $8, ensuring controlled and auditable program runtime spend.

## Key Concepts

- **Spend License Reserve/Fan-out**: Allocate and distribute spend licenses to contracted programs or agents, ensuring spend limits are respected.
- **ID Badges**: Unique identifiers issued to contracted agents or programs, used for authentication and authorization during runtime.
- **Accept → Ship Receipt**: The acceptance process of a spend license or runtime contract, resulting in a Ship Receipt that confirms the transaction.
- **Landing + Writeback**: The runtime landing process records the acceptance and writes back the state to the system, ensuring consistency and traceability.

## Usage

### Reserving Spend License

To reserve a spend license, use the `ReserveSpendLicense` API with the desired amount. The system will verify the monthly envelope and allocate accordingly.

### Fan-out

Fan-out distributes reserved licenses to multiple contracted agents or programs. This is handled automatically by the runtime system based on configured rules.

### ID Badges

ID badges are issued upon successful reservation and fan-out. They must be presented during acceptance to verify identity and authorization.

### Accept and Ship Receipt

When a contracted program accepts a spend license, a Ship Receipt is generated. This receipt serves as proof of acceptance and spend authorization.

## Architecture

This feature aligns with the Open IDs architecture described in [coppergate-architecture/docs/OPEN_PROGRAM.md](../coppergate-architecture/docs/OPEN_PROGRAM.md).

## Testing

Unit and integration tests cover:

- Spend license reservation respecting the $8 monthly envelope.
- Fan-out logic correctness.
- ID badge issuance and validation.
- Acceptance flow and Ship Receipt generation.

## Changelog

- Added Program Runtime spend license management with reservation, fan-out, ID badges, and acceptance flow.
- Implemented landing and writeback mechanisms for runtime state consistency.
