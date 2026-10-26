# Program Runtime (Contracted Autonomy) Spend License

## Overview

This document describes the Program Runtime capability for managing Contracted Autonomy spend licenses on reserve/fan-out, ID badges issuance, and the acceptance flow leading to a Ship Receipt. This feature is part of the P-104 initiative to enable controlled spend and identity management within the runtime environment.

## Key Concepts

- **Spend License on Reserve/Fan-out**: The system reserves a spend license for contracted autonomy operations, ensuring spend is tracked and capped under an $8 monthly envelope.
- **ID Badges**: Unique identity badges are issued to contracted autonomy programs to authenticate and authorize runtime actions.
- **Accept → Ship Receipt Flow**: After a spend license is accepted, a Ship Receipt is generated to confirm the transaction and update the runtime state accordingly.

## Usage

1. **Reserve Spend License**  
   When a contracted autonomy program initiates a spend, the system reserves the license amount from the monthly envelope.

2. **Issue ID Badge**  
   The program receives an ID badge that authenticates its runtime actions.

3. **Accept Spend License**  
   The program accepts the spend license, triggering the generation of a Ship Receipt.

4. **Ship Receipt**  
   The Ship Receipt confirms the spend and updates the program runtime state.

## Architecture Alignment

This feature aligns with the Open IDs and program runtime architecture described in [coppergate-architecture/docs/OPEN_PROGRAM.md](../coppergate-architecture/docs/OPEN_PROGRAM.md).

## Example
