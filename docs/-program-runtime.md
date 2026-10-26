# Program Runtime (Contracted Autonomy) Spend License

## Overview

This document describes the Program Runtime (Contracted Autonomy) Spend License feature (P-104), which enables reserving and fan-out of spend licenses within the program runtime. It also introduces ID badges for authorization and the acceptance flow culminating in a Ship Receipt.

This feature aligns with the architecture described in [OPEN_PROGRAM.md](../coppergate-architecture/docs/OPEN_PROGRAM.md) and supports a lean Arena model with an $8 monthly spend envelope.

## Key Concepts

- **Spend License Reserve/Fan-out**: Allows reserving a portion of the monthly spend envelope for contracted autonomy programs, enabling controlled fan-out of spend licenses to sub-programs or components.
- **ID Badges**: Unique identifiers issued to contracted autonomy programs to authenticate and authorize spend license usage.
- **Accept → Ship Receipt Flow**: Programs accept the spend license reservation and receive a Ship Receipt as confirmation and proof of license usage.

## Usage

### Reserving Spend License

Programs can reserve a portion of the $8 monthly envelope by requesting a spend license. The system ensures the reservation does not exceed the available envelope.

### Fan-out

Reserved spend licenses can be fanned out to sub-programs or components, each receiving an ID badge to track and authorize spend usage.

### Acceptance and Ship Receipt

Once a program accepts the reserved spend license, it receives a Ship Receipt. This receipt serves as a record of the transaction and can be used for auditing and verification.

## API

### ReserveSpendLicense(amount int) (LicenseID, error)

Reserves a spend license for the specified amount if available.

### FanOutLicense(parentLicenseID LicenseID, amount int) (ChildLicenseID, error)

Fans out a portion of a parent license to a child license.

### AcceptLicense(licenseID LicenseID) (ShipReceipt, error)

Accepts the license and returns a Ship Receipt.

## Example
