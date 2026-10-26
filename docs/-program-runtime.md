# Program Runtime (Contracted Autonomy) Spend License

## Overview

This feature introduces the Program Runtime Spend License capability, enabling contracted autonomy for program execution with controlled spend limits. It includes:

- License reservation and fan-out spend control.
- ID badge issuance for program runtime authorization.
- Acceptance flow from license spend to ship receipt confirmation.
- Integration with the `/docs/-program-runtime` documentation landing page.

## Key Concepts

### Spend License on Reserve/Fan-out

The system reserves a spend license for program runtime operations, ensuring that the spend does not exceed the contracted $8 monthly envelope. Fan-out operations are controlled to prevent overspending.

### ID Badges

Each program runtime instance receives an ID badge that authorizes its spend license usage. These badges are cryptographically verifiable and track spend attribution.

### Accept → Ship Receipt Flow

Once a spend license is accepted for a program runtime, a ship receipt is generated to confirm the transaction and update the spend ledger.

## Usage

1. **Reserve Spend License**  
   Programs request a spend license reservation before runtime execution.

2. **Receive ID Badge**  
   Upon reservation, the program receives an ID badge authorizing spend.

3. **Accept License and Ship Receipt**  
   The program accepts the license spend, triggering a ship receipt that finalizes the spend and updates the system state.

## Architecture

This feature aligns with the Open IDs architecture described in `coppergate-architecture/docs/OPEN_PROGRAM.md`. It leverages lean Arena design principles to maintain efficiency and scalability.

## Testing

The feature is covered by unit and integration tests validating:

- License reservation and spend limits.
- ID badge issuance and verification.
- Accept and ship receipt flows.

## Change History

- **P-104**: Initial implementation of Program Runtime Spend License with contracted autonomy.

---

For detailed API usage and examples, see the code documentation and tests in the primary coppergate repository.
