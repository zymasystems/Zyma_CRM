# Zyma Pay integration (CRM staff workspace)

## Security model

The CRM browser must call only the authenticated CRM API. It must never call `https://pay.zyma.co.za` directly and must never hold Zyma Pay credentials or a Zyma Pay session cookie.

The dashboard widget calls:

`GET https://api.zyma.co.za/api/crm/zyma-pay/dashboard`

The request is authenticated by the existing CRM bearer token through `ZymaCrmApi.request`.

The CRM API endpoint must be restricted to the `Admin` and `Employee` roles and perform server-to-server authentication to Zyma Pay using a dedicated, read-only `Viewer` account. Do not expose the Pay password or cookie in the response or logs.

## Expected response contract

```json
{
  "invoices": { "totalCount": 0 },
  "payments": {
    "totalCount": 0,
    "receivedThisMonth": 0,
    "awaitingReflectionCount": 0
  },
  "invoiceRecords": [
    {
      "clientName": "Example Client",
      "invoiceNumber": "INV-0001",
      "invoiceDate": "2026-11-01",
      "amount": 1000.00,
      "status": "Sent"
    }
  ],
  "paymentRecords": [
    {
      "clientName": "Example Client",
      "invoiceNumber": "INV-0001",
      "paymentDate": "2026-11-05",
      "amount": 1000.00,
      "status": "Paid"
    }
  ]
}
```

`receivedThisMonth` must be calculated from confirmed (`Paid`) payments whose `PaymentDate` falls within the current South African calendar month. `awaitingReflectionCount` must count `AwaitingReflection` payments. Do not derive invoice outstanding balances from payment totals; Zyma Pay currently does not enforce partial-payment-aware invoice status semantics.

The endpoint should return a bounded recent-record list (for example, 5–10 records per collection) while `totalCount` represents the full filtered collection count. Never include payment documents, email logs, confirmation notes, internal user IDs, or other unnecessary Pay entity metadata.

## Frontend behaviour

- Calls the CRM API only, via `ZymaCrmApi.request`.
- Uses the existing CRM bearer-token session.
- Does not send cookies to Zyma Pay.
- Dashboard financial widget remains read-only and shows a compact payment snapshot with a chart of recent paid amounts instead of invoice and payment lists.
