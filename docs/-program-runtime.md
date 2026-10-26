# Program Runtime (Contracted Autonomy) Spend License

## Overview

This document describes the Program Runtime capability for managing Contracted Autonomy spend licenses within the Coppergate platform. This feature enables reserving and fan-out of spend licenses, issuance of ID badges, and acceptance workflows culminating in ship receipts.

## Key Features

- **Spend License Reserve and Fan-out**  
  Programs can reserve a spend license from their monthly envelope ($8 cap) and fan-out licenses to sub-programs or components.

- **ID Badges**  
  Issued to identify authorized program runtime entities, enabling secure and auditable spend authorization.

- **Accept → Ship Receipt Workflow**  
  Programs can accept spend license allocations and generate ship receipts as proof of license usage.

- **Landing and Writeback**  
  All spend license activities are recorded and landed under `/docs/-program-runtime` for audit and traceability.

## Architecture

This capability aligns with the Open IDs architecture described in `coppergate-architecture/docs/OPEN_PROGRAM.md`. It leverages the lean Arena model for efficient runtime management.

## Usage

1. **Reserve Spend License**  
   Programs request a spend license reservation against their monthly envelope.

2. **Fan-out License**  
   Reserved licenses can be distributed to sub-programs or runtime components.

3. **Issue ID Badges**  
   ID badges are generated and assigned to runtime entities authorized to spend.

4. **Accept and Ship Receipt**  
   Upon acceptance, a ship receipt is generated and recorded.

## Limitations

- Monthly spend envelope is capped at $8.
- Only authorized programs with valid Open IDs can perform spend license operations.

## Change History

- **P-104**: Initial implementation of Program Runtime Spend License with reserve/fan-out, ID badges, accept → ship receipt workflow, and landing under `/docs/-program-runtime`.

---

For detailed API and usage examples, refer to the Coppergate primary repo source code and tests.
