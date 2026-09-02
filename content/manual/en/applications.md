# Payment Applications

Review merchants' **requests to use payment methods**.

## Types

| Type | Meaning |
|---|---|
| New use | The merchant wants to start using the method |
| Add method | An existing merchant adds another method |
| Limit change | A change to conditions such as the monthly limit |

The method is one of credit card / QR payment / konbini / bank transfer.

## List

Filter by status and merchant. **Pending** applications are always listed first.

## Reviewing (detail screen)

| Action | Result | Reason |
|---|---|---|
| Approve | Status becomes Approved and the method is added to the merchant's **enabled payment methods** | Optional |
| Reject | Status becomes Rejected | **Required** |
| Return | Status becomes Returned; the merchant can fix and re-apply | **Required** |

The review date is recorded. Reviewed applications cannot be changed again.

## Roles

Approve / reject / return are **master only**. The general role can read applications but sees no buttons. The server checks the role as well, so switching the UI toggle alone is not enough.
