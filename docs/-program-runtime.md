# Program Runtime (Contracted Autonomy) Spend License

## Overview

This document describes the Program Runtime feature (P-104) which enables contracted autonomy spend license management within the Coppergate platform. This feature allows programs to reserve and fan-out spend licenses, manage ID badges for authorization, and transition accepted spend into ship receipts.

## Key Concepts

- **Spend License Reserve/Fan-out**: Programs can reserve a portion of their spend license budget and fan it out to sub-components or tasks, ensuring controlled spend within the $8 monthly envelope.
- **ID Badges**: Unique identifiers issued to program components or agents to authorize spend license usage.
- **Accept → Ship Receipt**: Once a spend license is accepted by a component, it is converted into a ship receipt, confirming the spend and enabling downstream processing.

## Usage

### Reserving Spend License

Programs can reserve spend licenses by specifying the amount to allocate. The system ensures that the total reserved does not exceed the monthly envelope.
