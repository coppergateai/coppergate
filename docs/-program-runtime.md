# Program Runtime (Contracted Autonomy)

This document describes the Program Runtime capability introduced in P-104, which enables contracted autonomy spend licenses on reserve/fan-out, ID badges issuance, and the acceptance-to-ship receipt workflow.

## Overview

The Program Runtime feature allows programs to manage their spend licenses within a monthly envelope of $8, ensuring controlled usage of contracted autonomy resources. It supports:

- **Spend License on Reserve/Fan-out**: Programs can reserve spend licenses to fan-out tasks or subprograms while maintaining spend limits.
- **ID Badges**: Programs can issue ID badges to identify authorized agents or components.
- **Accept → Ship Receipt Workflow**: Programs can accept tasks or contracts and generate ship receipts to confirm fulfillment.

## Architecture Alignment

This feature aligns with the Open IDs and program runtime architecture described in [OPEN_PROGRAM.md](../../coppergate-architecture/docs/OPEN_PROGRAM.md). It leverages the lean Arena model for efficient resource management.

## Usage

### Reserving Spend License

Programs can reserve spend licenses by specifying the amount within their $8 monthly envelope. The system enforces spend limits and prevents overspending.

### Issuing ID Badges

ID badges are issued to program agents to authenticate and authorize actions within the runtime.

### Accepting and Shipping

Programs accept contracts or tasks, triggering the generation of ship receipts that confirm the transaction.

## API
