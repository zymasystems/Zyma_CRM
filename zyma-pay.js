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
      date: read(payment, "paymentDate", "payment_date", "createdAt", "created_at") ?? "",
      amount: amount(read(payment, "amount")),
      status: getStatus(read(payment, "status"))
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

  function formatChartMoney(value) {
    return `R ${new Intl.NumberFormat("en-ZA", { notation: "compact", maximumFractionDigits: 1 }).format(value)}`;
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

  function svgElement(tag, attributes = {}) {
    const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
    for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
    return node;
  }

  function appendPaymentChart(container, records) {
    const section = element("section", "dx-pay-chart");
    section.append(element("h3", "", "Recent paid amounts"));
    const paid = records.filter(record => record.status === "Paid" && dateValue(record.date)).slice(0, 6).reverse();
    if (!paid.length) {
      section.append(element("p", "dx-pay-chart-empty", "Paid payment history will appear here when available."));
      container.append(section);
      return;
    }

    const width = 560;
    const height = 190;
    const left = 64;
    const right = 12;
    const top = 16;
    const bottom = 34;
    const chartHeight = height - top - bottom;
    const chartWidth = width - left - right;
    const maxAmount = Math.max(1, ...paid.map(record => record.amount));
    const svg = svgElement("svg", {
      viewBox: `0 0 ${width} ${height}`,
      role: "img",
      "aria-label": `Recent paid amounts: ${paid.map(record => `${formatDate(record.date)}, ${formatMoney(record.amount)}`).join("; ")}`
    });

    for (let tick = 0; tick <= 2; tick += 1) {
      const y = top + chartHeight * tick / 2;
      const grid = svgElement("line", { x1: left, x2: width - right, y1: y, y2: y, class: "dx-pay-grid" });
      const label = svgElement("text", { x: left - 8, y: y + 4, "text-anchor": "end", class: "dx-pay-axis" });
      label.textContent = formatMoney(maxAmount * (1 - tick / 2));
      svg.append(grid, label);
    }

    const slot = chartWidth / paid.length;
    const barWidth = Math.min(42, slot * 0.58);
    paid.forEach((record, index) => {
      const barHeight = Math.max(2, chartHeight * record.amount / maxAmount);
      const x = left + slot * index + (slot - barWidth) / 2;
      const y = top + chartHeight - barHeight;
      const group = svgElement("g", { role: "img", "aria-label": `${formatDate(record.date)}: ${formatMoney(record.amount)}` });
      group.append(svgElement("rect", { x, y, width: barWidth, height: barHeight, class: "dx-pay-bar" }));
      const value = svgElement("text", { x: x + barWidth / 2, y: Math.max(top + 10, y - 5), "text-anchor": "middle", class: "dx-pay-bar-label" });
      value.textContent = formatChartMoney(record.amount);
      const date = svgElement("text", { x: x + barWidth / 2, y: height - 11, "text-anchor": "middle", class: "dx-pay-axis" });
      date.textContent = new Intl.DateTimeFormat("en-ZA", { day: "numeric", month: "short" }).format(new Date(record.date));
      group.append(value, date);
      svg.append(group);
    });
    section.append(svg);
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
    const receivedThisMonth = read(summary.payments, "receivedThisMonth");
    const paidValue = receivedThisMonth != null
      ? amount(receivedThisMonth)
      : summary.paymentRecords.filter(record => record.status === "Paid").reduce((total, record) => total + record.amount, 0);
    const paidNote = receivedThisMonth != null
      ? "Received this month"
      : "Paid records in recent results";
    appendSummaryMetric(metrics, "Received", formatMoney(paidValue), paidNote);
    const awaitingCount = read(summary.payments, "awaitingReflectionCount");
    appendSummaryMetric(metrics, "Awaiting reflection", Number(awaitingCount ?? summary.paymentRecords.filter(record => record.status === "Awaiting").length).toLocaleString("en-ZA"), "Payment records");
    host.append(metrics);
    appendPaymentChart(host, summary.paymentRecords);
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
      const paymentRecords = getRecords(payload, "paymentRecords").map(normalizePayment);
      summary = {
        payments: payload?.summary?.payments || payload?.payments || {},
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
