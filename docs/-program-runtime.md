# Program Runtime (Contracted Autonomy) Spend License

## Overview

This document describes the Program Runtime feature (P-104) which enables contracted autonomy spend license management within the Coppergate platform. It covers the lifecycle from license reservation, fan-out, ID badge issuance, acceptance, and final ship receipt confirmation.

## Key Concepts

- **Spend License on Reserve/Fan-out**: The system reserves a spend license from the monthly envelope ($8 cap) and fans it out to authorized program runtimes.
- **ID Badges**: Unique identifiers issued to program runtimes to authenticate and authorize spend usage.
- **Accept → Ship Receipt**: The acceptance of a spend license triggers a ship receipt event confirming the license usage and finalization.
- **Landing + Writeback**: The runtime landing process writes back the license usage and status to the system.

## Architecture Alignment

This feature aligns with the Open IDs and architecture described in `coppergate-architecture/docs/OPEN_PROGRAM.md`. It uses lean Arena principles for minimal overhead and efficient runtime management.

## Usage

1. **Reserve License**: When a program runtime is initiated, a spend license is reserved from the monthly envelope.
2. **Fan-out**: The reserved license is fanned out to multiple runtime instances as needed.
3. **ID Badge Issuance**: Each runtime instance receives an ID badge for authentication.
4. **Accept License**: The runtime accepts the license, triggering a ship receipt.
5. **Ship Receipt**: Confirms the license usage and updates the system state.
6. **Landing + Writeback**: The runtime lands and writes back the usage data.

## Monthly Envelope

The spend license is managed under an $8 monthly envelope to control costs and ensure budget adherence.

## Testing and Validation

- Unit tests cover license reservation, fan-out, badge issuance, acceptance, and receipt.
- Integration tests validate end-to-end flow.
- Validation ensures spend does not exceed monthly envelope.

## Change Log

- Added P-104 Program Runtime Spend License feature.
- Implemented license reservation, fan-out, ID badges, acceptance, and ship receipt.
- Added tests and documentation.

---

For detailed API and usage examples, see the Coppergate primary repository source code.
