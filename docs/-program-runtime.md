# Program Runtime (Contracted Autonomy) Spend License

## Overview

This feature introduces the Program Runtime (Contracted Autonomy) spend license management within the Coppergate platform. It enables the reservation and fan-out of spend licenses tied to program runtime contracts, integrates ID badges for authorization, and supports the acceptance flow culminating in a Ship Receipt.

## Key Concepts

- **Spend License on Reserve/Fan-out**: Allows programs to reserve a spend license from a monthly envelope ($8 cap) and fan it out to subcomponents or runtime units.
- **ID Badges**: Unique identifiers issued to runtime entities to validate their authorization to spend from the reserved license.
- **Accept → Ship Receipt**: A transactional flow where the acceptance of a runtime contract triggers issuance of a Ship Receipt, confirming the spend and authorization.

## Usage

1. **Reserve a Spend License**

   Programs can reserve a portion of their monthly envelope spend license for runtime use. This reservation is tracked and cannot exceed the $8 monthly cap.

2. **Fan-out License**

   The reserved license can be fanned out to multiple runtime components, each receiving an ID badge authorizing spend.

3. **Accept and Ship**

   When a runtime component accepts the contract, it triggers the generation of a Ship Receipt, confirming the spend and authorization.

## API

### ReserveLicense(programID string, amount float64) error

Reserves a spend license amount for the given program.

### FanOutLicense(programID string, componentID string, amount float64) (IDBadge, error)

Fans out a portion of the reserved license to a runtime component, returning an ID badge.

### AcceptContract(componentID string) (ShipReceipt, error)

Accepts the contract for the component, generating a Ship Receipt.

## Architecture

This feature aligns with the Open IDs architecture described in `coppergate-architecture/docs/OPEN_PROGRAM.md`. It uses lean Arena patterns to manage spend licenses and runtime authorization badges efficiently.

## Limitations

- The monthly envelope is capped at $8.
- Spend licenses cannot be over-reserved or over-fanned out.
- ID badges are unique and non-transferable.

## Change Log

- Added Program Runtime Spend License management.
- Introduced ID badges for runtime authorization.
- Implemented Accept → Ship Receipt flow.
