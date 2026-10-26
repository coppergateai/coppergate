# Program Runtime (Contracted Autonomy) Spend License

## Overview

This document describes the Program Runtime (Contracted Autonomy) spend license feature, also known as P-104. It enables managing spend licenses on reserve/fan-out operations, handling ID badges for program participants, and the acceptance flow leading to a ship receipt.

This feature is designed to operate within the $8 monthly envelope spend cap and aligns with the architecture defined in [OPEN_PROGRAM.md](../coppergate-architecture/docs/OPEN_PROGRAM.md).

## Key Concepts

- **Spend License on Reserve/Fan-out**: Programs can reserve spend licenses to ensure budget adherence during fan-out operations.
- **ID Badges**: Unique identifiers assigned to program participants or runtime instances to track authorization and usage.
- **Accept → Ship Receipt Flow**: After acceptance of a program runtime contract, a ship receipt is generated to confirm the transaction and license usage.

## Usage

### Reserving Spend License

When a program runtime initiates a fan-out operation, it must reserve spend licenses upfront to guarantee budget compliance.

Example:
