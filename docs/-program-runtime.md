# Program Runtime (Contracted Autonomy) Spend License

This document describes the new **Program Runtime Spend License** feature introduced in P-104.

## Overview

The Program Runtime Spend License enables contracted autonomy for programs running within the Coppergate platform. This feature introduces:

- **Spend License on Reserve/Fan-out:** Programs can reserve a spend license to manage their runtime spend within a monthly envelope.
- **ID Badges:** Programs receive unique ID badges to identify and authorize spend licenses.
- **Accept → Ship Receipt Flow:** Programs can accept spend licenses and receive ship receipts as proof of authorization.
- **Landing + Writeback:** Spend license state is landed and written back to the system to ensure consistency and auditability.

## Architecture

This feature aligns with the Open IDs architecture described in [coppergate-architecture/docs/OPEN_PROGRAM.md](../coppergate-architecture/docs/OPEN_PROGRAM.md).

## Usage

1. **Reserve a Spend License:**

   Programs request a spend license reservation to fan out spend capacity.

2. **Receive ID Badge:**

   Upon reservation, programs receive an ID badge that uniquely identifies their spend license.

3. **Accept Spend License:**

   Programs accept the spend license to activate it.

4. **Ship Receipt:**

   After acceptance, a ship receipt is generated and returned to the program as proof.

5. **Landing and Writeback:**

   The spend license state is landed in the system and written back to ensure the spend is accounted for.

## Monthly Envelope

The spend license operates within an $8 monthly envelope, ensuring spend limits are respected.

## Example
