# Program Runtime (Contracted Autonomy) Spend License

## Overview

This document describes the Program Runtime feature (P-104) which enables contracted autonomy spend license management on reserve/fan-out, ID badges issuance, and the acceptance flow leading to a ship receipt. This feature is designed to work within the $8 monthly envelope spend cap and aligns with the architecture outlined in [OPEN_PROGRAM.md](../coppergate-architecture/docs/OPEN_PROGRAM.md).

## Features

- **Spend License on Reserve/Fan-out**  
  The system reserves and fans out spend licenses to ensure controlled autonomy spend within the monthly envelope.

- **ID Badges**  
  Unique ID badges are issued to program runtimes to identify and authorize their spend capabilities.

- **Accept → Ship Receipt Flow**  
  After acceptance of a spend license, a ship receipt is generated and recorded, confirming the transaction.

- **Landing + Writeback**  
  The runtime landing process includes writeback of spend license state to ensure consistency and auditability.

## Usage

1. **Reserve Spend License**  
   When a program runtime initiates, it requests a spend license reservation. The system checks the monthly envelope and allocates accordingly.

2. **Fan-out Spend License**  
   The reserved spend license can be fanned out to child runtimes or tasks, each receiving an ID badge.

3. **Accept Spend License**  
   The runtime accepts the spend license, triggering the generation of a ship receipt.

4. **Ship Receipt**  
   The ship receipt confirms the spend license acceptance and is recorded for audit.

## Architecture

This feature implements the Open IDs and spend license management as described in the architecture document [OPEN_PROGRAM.md](../coppergate-architecture/docs/OPEN_PROGRAM.md). It uses a lean Arena model to manage runtime spend within the $8 monthly envelope.

## Testing

Automated tests cover:

- Spend license reservation and fan-out logic
- ID badge issuance and validation
- Accept to ship receipt flow correctness
- Landing and writeback state consistency

## Change History

- **P-104**: Initial implementation of Program Runtime Spend License with contracted autonomy, ID badges, and ship receipt flow.

---

For detailed API and usage examples, see the source code and tests in the primary coppergate repo.
