# Program Runtime (Contracted Autonomy) Spend License

## Overview

This document describes the Program Runtime capability for managing Contracted Autonomy spend licenses within the Coppergate platform. This feature enables reserving and fan-out of spend licenses, issuance of ID badges, and the acceptance flow leading to a Ship Receipt.

## Key Concepts

- **Spend License Reserve/Fan-out**: Allows programs to reserve a portion of their monthly spend envelope ($8 monthly cap) for contracted autonomy operations. The reserved amount can be fanned out to subcomponents or agents.
- **ID Badges**: Unique identifiers issued to contracted autonomy agents or components to authenticate and authorize spend usage.
- **Accept → Ship Receipt Flow**: Once a spend license is accepted by an agent, a Ship Receipt is generated to confirm the transaction and update the program runtime state.

## Usage

### Reserving Spend License

Programs can reserve a portion of their monthly spend envelope for contracted autonomy by specifying the amount to reserve. The system ensures the total reserved does not exceed the $8 monthly envelope.

### Fan-out

Reserved spend licenses can be fanned out to multiple agents or components, each receiving an ID badge representing their authorization.

### Accept and Ship Receipt

When an agent accepts a spend license, the system generates a Ship Receipt that records the transaction and updates the program runtime ledger.

## Architecture

This capability aligns with the Open IDs and architecture described in [coppergate-architecture/docs/OPEN_PROGRAM.md](../coppergate-architecture/docs/OPEN_PROGRAM.md).

## Example
