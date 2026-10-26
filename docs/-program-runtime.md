# Program Runtime (Contracted Autonomy)

This document describes the **Program Runtime** feature (P-104), which enables managing spend licenses on reserve/fan-out, ID badges issuance, and the acceptance-to-ship receipt workflow.

## Overview

The Program Runtime capability allows programs to:

- Reserve and fan-out spend licenses within a monthly spend envelope.
- Issue ID badges to authorized entities.
- Accept program outputs and generate ship receipts.
- Maintain a landing zone for program runtime data under `/docs/-program-runtime`.
- Write back runtime state and receipts to the system.

This feature aligns with the architecture described in [OPEN_PROGRAM.md](../coppergate-architecture/docs/OPEN_PROGRAM.md) and is designed to operate within an $8 monthly spend envelope.

## Key Concepts

### Spend License Reserve/Fan-out

Programs can reserve a portion of their monthly spend license and fan it out to subcomponents or tasks. This ensures controlled spending and autonomy within contracted limits.

### ID Badges

ID badges are issued to entities (users or subprograms) to authenticate and authorize actions within the program runtime.

### Accept → Ship Receipt

When a program accepts an output or result, it generates a ship receipt that confirms the acceptance and logs the transaction.

### Landing Zone and Writeback

Runtime data, including receipts and state, are landed under `/docs/-program-runtime` and written back to the system for audit and traceability.

## Usage

### Reserving Spend License
