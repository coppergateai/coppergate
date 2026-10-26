# Program Runtime (Contracted Autonomy) Spend License

## Overview

This document describes the Program Runtime capability for managing Contracted Autonomy spend licenses within the Coppergate platform. This feature enables reserving and fan-out of spend licenses, issuance and management of ID badges, and the acceptance flow culminating in a Ship Receipt.

## Key Concepts

- **Spend License Reserve/Fan-out**: Allows programs to reserve a portion of their monthly spend envelope ($8 monthly cap) and fan-out licenses to sub-programs or components.
- **ID Badges**: Unique identifiers issued to contracted autonomous agents or components to authenticate and authorize spend.
- **Accept → Ship Receipt Flow**: Once a spend license is accepted, a Ship Receipt is generated to confirm the transaction and update the program runtime state.

## Architecture Alignment

This capability aligns with the Open IDs and architecture defined in [coppergate-architecture/docs/OPEN_PROGRAM.md](../coppergate-architecture/docs/OPEN_PROGRAM.md), ensuring consistent identity and authorization management.

## Usage

### Reserving Spend License

Programs can reserve a portion of their monthly spend envelope to allocate spend licenses to sub-programs or agents.

### Issuing ID Badges

ID badges are issued to contracted autonomous agents to enable them to spend within their allocated license.

### Accepting Spend License and Generating Ship Receipt

When a spend license is accepted by an agent, a Ship Receipt is generated and recorded to confirm the transaction.

## API

The primary API endpoints and data structures are documented inline in the source code.

## Testing

Automated tests cover the reserve/fan-out logic, ID badge issuance, and accept → ship receipt flow to ensure correctness and compliance with architecture.

---

*This feature is part of P-104 and is subject to an $8 monthly spend envelope.*
