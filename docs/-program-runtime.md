# Program Runtime (Contracted Autonomy) Spend License

## Overview

This document describes the Program Runtime capability for managing contracted autonomy spend licenses within the Coppergate platform. This feature enables reserving and fan-out of spend licenses, issuing ID badges, and accepting spend licenses to generate ship receipts.

## Key Concepts

- **Spend License**: A contract-bound authorization to spend a defined budget envelope.
- **Reserve/Fan-out**: The ability to reserve a portion of the spend license or fan-out smaller licenses from a larger envelope.
- **ID Badges**: Digital badges issued to identify and authorize spend license holders.
- **Accept → Ship Receipt**: The process of accepting a spend license reservation and generating a ship receipt as proof of spend authorization.

## Usage

### Reserving Spend License

Users can reserve a portion of their contracted autonomy spend license to allocate budget for specific program runtime activities.

### Fan-out

Fan-out allows splitting a spend license into smaller licenses for delegation or parallel usage.

### ID Badges

ID badges are issued to authorized users or agents to validate their spend license rights.

### Accepting Spend License and Generating Ship Receipt

Once a spend license reservation is accepted, a ship receipt is generated to confirm the transaction and enable downstream processing.

## API Endpoints

- `POST /program-runtime/spend/reserve` — Reserve a portion of spend license.
- `POST /program-runtime/spend/fanout` — Fan-out spend license into smaller licenses.
- `POST /program-runtime/idbadge/issue` — Issue an ID badge for spend license holder.
- `POST /program-runtime/spend/accept` — Accept a spend license reservation and generate ship receipt.

## Architecture

This capability aligns with the Open IDs and program runtime architecture described in [coppergate-architecture/docs/OPEN_PROGRAM.md](../coppergate-architecture/docs/OPEN_PROGRAM.md).

## Monthly Envelope

The feature operates within an $8 monthly spend envelope to ensure budget compliance.

---

_Last updated: 2024-06_
