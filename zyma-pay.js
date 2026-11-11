/* Read-only Zyma Pay summary for the CRM dashboard. */
(() => {
  "use strict";

  const REFRESH_INTERVAL_MS = 60_000;
  let lastLoadedAt = 0;
  let loading = false;
  let summary = null;
  let loadError = null;

  function amount(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
  }

  function getRecords(payload, key) {
    if (Array.isArray(payload)) return payload;
    const pascalKey = key.charAt(0).toUpperCase() + key.slice(1);
    for (const candidate of [payload?.items, payload?.Items, payload?.data, payload?.Data, payload?.[key], payload?.[pascalKey]]) {
      if (Array.isArray(candidate)) return candidate;
    }
    return [];
  }

  function getStatus(value) {
    const status = String(value ?? "").trim().toLowerCase();
    if (["1", "paid", "paymentconfirmed", "payment confirmed"].includes(status)) return "Paid";
    if (["2", "cancelled", "canceled"].includes(status)) return "Cancelled";
    if (["0", "awaiting", "awaitingreflection", "awaiting reflection", "awaiting_reflection"].includes(status)) return "Awaiting";
    if (["sent", "unpaid", "awaiting payment", "awaiting_payment"].includes(status)) return "Sent";
    return status ? status.replace(/[_-]+/g, " ").replace(/\b\w/g, char => char.toUpperCase()) : "Unknown";
  }

  function read(record, ...keys) {
    for (const key of keys) {
      if (record?.[key] != null) return record[key];
      const pascal = key.charAt(0).toUpperCase() + key.slice(1);
      if (record?.[pascal] != null) return record[pascal];
    }
    return undefined;
  }

  async function getDashboard(signal) {
    if (!window.ZymaCrmApi || typeof window.ZymaCrmApi.request !== "function") {
      throw new Error("The CRM API client is unavailable. Reload the workspace and try again.");
    }
    // Financial data is fetched by the authenticated CRM backend. The browser
    // never receives Zyma Pay credentials or a Zyma Pay session cookie.
    return window.ZymaCrmApi.request("/zyma-pay/dashboard", {
      method: "GET",
      signal
    });
  }

  function normalizePayment(payment) {
    return {
      client: read(payment, "clientName", "client_name") ?? "Unknown client",
      reference: read(payment, "invoiceNumber", "invoice_number") ?? "—",
      date: read(payment, "paymentDate", "payment_date", "createdAt", "created_at") ?? "",
      amount: amount(read(payment, "amount")),
      status: getStatus(read(payment, "status"))
    };
  }

  function normalizeInvoice(invoice) {
    return {
      client: read(invoice, "clientName", "client_name") ?? "Unknown client",
      reference: read(invoice, "invoiceNumber", "invoice_number", "number") ?? "—",
      date: read(invoice, "invoiceDate", "invoice_date", "createdAt", "created_at", "dueDate", "due_date") ?? "",
      amount: amount(read(invoice, "amount", "total")),
      status: getStatus(read(invoice, "status"))
    };
  }

  function dateValue(value) {
    if (!value) return 0;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 0 : date.getTime();
  }

  function formatDate(value) {
    if (!value || !dateValue(value)) return "Date not set";
    return new Intl.DateTimeFormat("en-ZA", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value));
  }

  function formatMoney(value) {
    return new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", maximumFractionDigits: 2 }).format(value);
  }

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function appendSummaryMetric(container, label, value, note) {
    const card = element("div", "dx-pay-metric");
    card.append(element("span", "", label), element("strong", "", value), element("small", "", note));
    container.append(card);
  }

  function appendRecords(container, title, records, emptyText) {
    const section = element("section", "dx-pay-records");
    section.append(element("h3", "", title));
    if (!records.length) {
      section.append(element("p", "dx-empty", emptyText));
      container.append(section);
      return;
    }
    const list = element("ul", "dx-pay-list");
    records.slice(0, 5).forEach(record => {
      const row = element("li", "dx-pay-row");
      const detail = element("span", "dx-pay-record-main");
      detail.append(element("strong", "", record.client), element("small", "", `${record.reference} · ${formatDate(record.date)}`));
      const status = element("span", "dx-pay-record-status", record.status);
      const value = element("strong", "dx-pay-record-amount", formatMoney(record.amount));
      row.append(detail, status, value);
      list.append(row);
    });
    section.append(list);
    container.append(section);
  }

  function render() {
    const host = document.getElementById("dx-pay-content");
    const status = document.getElementById("dx-pay-status");
    if (!host || !status) return;

    host.replaceChildren();
    if (loadError) {
      status.textContent = loadError.message;
      status.classList.add("is-error");
      return;
    }
    status.classList.remove("is-error");
    if (!summary) {
      status.textContent = loading ? "Connecting to Zyma Pay…" : "Financial data is not loaded yet.";
      return;
    }

    status.textContent = `Read-only data · Refreshed ${new Intl.DateTimeFormat("en-ZA", { hour: "2-digit", minute: "2-digit" }).format(new Date(lastLoadedAt))}`;
    const metrics = element("div", "dx-pay-metrics");
    const invoiceTotal = read(summary.invoices, "totalCount");
    const invoiceCount = invoiceTotal != null && Number.isFinite(Number(invoiceTotal))
      ? Number(invoiceTotal)
      : summary.invoiceRecords.length;
    const paymentTotal = read(summary.payments, "totalCount");
    const paymentCount = paymentTotal != null && Number.isFinite(Number(paymentTotal))
      ? Number(paymentTotal)
      : summary.paymentRecords.length;
    const receivedThisMonth = read(summary.payments, "receivedThisMonth");
    const paidValue = receivedThisMonth != null
      ? amount(receivedThisMonth)
      : summary.paymentRecords.filter(record => record.status === "Paid").reduce((total, record) => total + record.amount, 0);
    const paidNote = receivedThisMonth != null
      ? "Received this month"
      : "Paid records in loaded results";

    appendSummaryMetric(metrics, "Invoices", invoiceCount.toLocaleString("en-ZA"), "In Zyma Pay");
    appendSummaryMetric(metrics, "Payments", paymentCount.toLocaleString("en-ZA"), "In Zyma Pay");
    const awaitingCount = read(summary.payments, "awaitingReflectionCount");
    appendSummaryMetric(metrics, "Awaiting reflection", Number(awaitingCount ?? summary.paymentRecords.filter(record => record.status === "Awaiting").length).toLocaleString("en-ZA"), "Payment records");
    appendSummaryMetric(metrics, "Paid value", formatMoney(paidValue), paidNote);
    host.append(metrics);
    appendRecords(host, "Recent invoices", summary.invoiceRecords, "No invoices found in Zyma Pay.");
    appendRecords(host, "Recent payments", summary.paymentRecords, "No payments found in Zyma Pay.");
  }

  async function load(force = false) {
    if (loading || (!force && Date.now() - lastLoadedAt < REFRESH_INTERVAL_MS)) return;
    loading = true;
    loadError = null;
    render();
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15_000);
    try {
      const payload = await getDashboard(controller.signal);
      const invoiceRecords = getRecords(payload, "invoiceRecords").map(normalizeInvoice);
      const paymentRecords = getRecords(payload, "paymentRecords").map(normalizePayment);
      summary = {
        invoices: payload?.summary?.invoices || payload?.invoices || {},
        payments: payload?.summary?.payments || payload?.payments || {},
        invoiceRecords: invoiceRecords.sort((a, b) => dateValue(b.date) - dateValue(a.date)),
        paymentRecords: paymentRecords.sort((a, b) => dateValue(b.date) - dateValue(a.date))
      };
      lastLoadedAt = Date.now();
    } catch (error) {
      loadError = error.name === "AbortError"
        ? new Error("Zyma Pay took too long to respond. Try again.")
        : error instanceof TypeError
          ? new Error("Could not reach the CRM financial integration. Check your connection and try again.")
          : error;
    } finally {
      window.clearTimeout(timeout);
      loading = false;
      render();
    }
  }

  window.renderZymaPayDashboard = () => { render(); void load(); };
  document.addEventListener("click", event => {
    if (event.target.closest("[data-pay-refresh]")) void load(true);
  });
})();
