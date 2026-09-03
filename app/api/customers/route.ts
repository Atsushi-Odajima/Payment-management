import { ok, withApiHandler } from "@/lib/api/handler";
import { CSV_MAX_ROWS, csvResponse, toCsv } from "@/lib/csv";
import { loadCustomers, loadCustomersForExport, parseCustomerFilters, parseCustomerSort } from "@/lib/customers/list";
import { DEFAULT_PAGE_SIZE, parsePage } from "@/lib/pagination";
import { piiCsvMode } from "@/lib/pii/csv";

/** GET /api/customers — customer master (masked); `?format=csv` follows the global CSV personal-data setting. */
export const GET = withApiHandler(async (req) => {
  const q = Object.fromEntries(new URL(req.url).searchParams.entries());
  const filters = parseCustomerFilters(q);
  const sort = parseCustomerSort(q);
  if (q.format === "csv") {
    const rows = await loadCustomersForExport(filters, sort, CSV_MAX_ROWS, await piiCsvMode(req));
    return csvResponse(
      toCsv(rows, [
        { header: "customerId", value: (r) => r.id },
        { header: "merchantCode", value: (r) => r.merchant.merchantCode },
        { header: "externalId", value: (r) => r.externalId },
        { header: "name", value: (r) => r.name },
        { header: "email", value: (r) => r.email },
        { header: "phone", value: (r) => r.phone },
        { header: "payments", value: (r) => r.paymentCount },
        { header: "tokens", value: (r) => r.tokenCount },
        { header: "lastPaymentAt", value: (r) => r.lastPaymentAt },
        { header: "anonymizedAt", value: (r) => r.anonymizedAt },
        { header: "createdAt", value: (r) => r.createdAt },
      ]),
      "customers.csv",
    );
  }
  const page = parsePage(q.page);
  const { rows, total } = await loadCustomers({ filters, sort, page, pageSize: DEFAULT_PAGE_SIZE, mode: "masked" });
  return ok({ customers: rows, total, page, pageSize: DEFAULT_PAGE_SIZE });
});
