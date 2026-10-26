# Program Runtime (Contracted Autonomy) Spend License

## Overview

This document describes the Program Runtime (Contracted Autonomy) spend license feature introduced in P-104. This feature enables the system to reserve and fan-out spend licenses for program runtime contracts, manage ID badges for authorization, and handle acceptance flows culminating in a ship receipt.

## Key Concepts

- **Spend License on Reserve/Fan-out**: The system reserves a spend license upfront and fans it out to multiple runtime contracts to ensure budget compliance within the $8 monthly envelope.
- **ID Badges**: Unique identifiers issued to runtime contracts to authenticate and authorize spend operations.
- **Accept → Ship Receipt Flow**: After a runtime contract accepts the spend license, a ship receipt is generated to confirm the transaction.
- **Landing and Writeback**: The feature lands in the primary coppergate repo and writes back state changes to the runtime environment.
- **Architecture Compliance**: The implementation aligns with the Open IDs and architecture described in `coppergate-architecture/docs/OPEN_PROGRAM.md`.

## Usage

1. **Reserve Spend License**  
   The system reserves a spend license for a program runtime contract. This reservation ensures the contract has the budget to operate within the $8 monthly envelope.

2. **Fan-out Spend License**  
   The reserved license can be fanned out to multiple subcontracts or runtime instances, each receiving an ID badge for authorization.

3. **Accept Spend License**  
   Runtime contracts accept the spend license by presenting their ID badge. Upon acceptance, a ship receipt is generated.

4. **Ship Receipt**  
   The ship receipt confirms the spend license acceptance and is logged for audit and reconciliation.

## Example
