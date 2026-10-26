# Program Runtime (Contracted Autonomy) Spend License

## Overview

This document describes the Program Runtime feature introduced in P-104, which enables contracted autonomy spend license management on reserve/fan-out operations. It also covers ID badge issuance, the acceptance flow leading to ship receipts, and the integration with the runtime landing and writeback process.

## Features

- **Spend License on Reserve/Fan-out**  
  The system now tracks and enforces spend licenses during program runtime, ensuring that contracted autonomy operations respect the $8 monthly envelope spend cap.

- **ID Badges**  
  Each program runtime instance is assigned an ID badge to uniquely identify and authorize its operations within the system.

- **Accept → Ship Receipt Flow**  
  Upon acceptance of a runtime operation, a ship receipt is generated to confirm the transaction and update the system state accordingly.

- **Landing and Writeback**  
  Runtime operations land in the system under `/docs/-program-runtime` and perform writebacks to maintain consistency and auditability.

## Usage

1. When a program runtime operation is initiated, the system checks the spend license availability.
2. If sufficient spend license remains, the operation proceeds, and an ID badge is assigned.
3. Upon acceptance, a ship receipt is generated and logged.
4. The runtime operation lands in the system and performs writeback to update the state.

## Architecture

This feature aligns with the Open IDs architecture described in `coppergate-architecture/docs/OPEN_PROGRAM.md`. It uses lean Arena principles to maintain efficiency and scalability.

## Testing

The feature is covered by automated tests validating spend license enforcement, ID badge issuance, acceptance flow, and landing/writeback correctness.

## Change History

- **P-104**: Initial implementation of Program Runtime Spend License, ID badges, accept-to-ship receipt flow, and landing/writeback.

---

For more details, see the source code and tests in the primary coppergate repository.
