# Program Runtime (Contracted Autonomy) Spend License

This document describes the **Program Runtime Spend License** feature introduced in P-104.

## Overview

The Program Runtime Spend License enables contracted autonomy for programs by managing spend licenses on reserve/fan-out operations. It integrates with ID badges for authorization and supports a workflow from acceptance to ship receipt.

This feature is designed to operate within a monthly spend envelope of $8, ensuring cost control and predictable budgeting.

## Key Features

- **Spend License on Reserve/Fan-out**  
  Programs can reserve spend licenses when performing fan-out operations, ensuring that spend limits are respected before execution.

- **ID Badges for Authorization**  
  Each program runtime is associated with an ID badge that authenticates and authorizes spend license usage.

- **Accept → Ship Receipt Workflow**  
  After reserving spend licenses and performing operations, the system accepts the spend and issues a ship receipt confirming the transaction.

- **Landing and Writeback**  
  The spend license state is landed and written back to persistent storage to maintain accurate accounting and audit trails.

## Usage

1. **Reserve Spend License**  
   When a program runtime initiates a fan-out, it requests a spend license reservation. The system checks the available envelope and grants or denies the request.

2. **Authorization via ID Badge**  
   The program runtime must present a valid ID badge to authenticate the spend license request.

3. **Accept and Ship Receipt**  
   Upon successful operation, the spend license is accepted, and a ship receipt is generated and recorded.

4. **Landing and Writeback**  
   The updated spend license state is persisted to ensure consistency across program executions.

## Architecture

This feature aligns with the Open IDs architecture described in [coppergate-architecture/docs/OPEN_PROGRAM.md](../coppergate-architecture/docs/OPEN_PROGRAM.md).

## Limitations

- The monthly spend envelope is fixed at $8.
- The feature currently supports lean Arena environments.

## Change History

- **P-104**: Initial implementation of Program Runtime Spend License with reserve/fan-out, ID badges, accept → ship receipt workflow, and landing/writeback.

---

For detailed API and implementation notes, see the source code and tests in the primary coppergate repository.
