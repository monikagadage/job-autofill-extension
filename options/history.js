// options/history.js
//
// The "Application History" tab: lists every entry lib/history-store.js
// has logged (one per successful "Fill this page" or "Tailor resume" run),
// with search/status-filter/sort controls and a per-row status picker that
// writes straight back through updateApplicationStatus(). Loaded as its
// own <script type="module"> on options.html, independent of options.js's
// profile form.

import { loadHistory, updateApplicationStatus, deleteApplication, APPLICATION_STATUSES } from "../lib/history-store.js";

const searchInput = document.getElementById("history-search");
const statusFilter = document.getElementById("history-status-filter");
const sortSelect = document.getElementById("history-sort");
const table = document.getElementById("history-table");
const tableBody = document.getElementById("history-table-body");
const emptyState = document.getElementById("history-empty");

const STATUS_LABEL = { applied: "Applied", interviewing: "Interviewing", rejected: "Rejected", offer: "Offer" };

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text ?? "";
  return div.innerHTML;
}

function matchesFilters(entry, query, status) {
  if (status !== "all" && entry.status !== status) return false;
  if (!query) return true;
  return `${entry.company} ${entry.jobTitle}`.toLowerCase().includes(query.toLowerCase());
}

function sortEntries(entries, sortKey) {
  const sorted = [...entries];
  if (sortKey === "oldest") return sorted.sort((a, b) => a.timestamp - b.timestamp);
  if (sortKey === "company") return sorted.sort((a, b) => a.company.localeCompare(b.company));
  return sorted.sort((a, b) => b.timestamp - a.timestamp); // "newest" (default)
}

function formatDate(timestamp) {
  return new Date(timestamp).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function renderRow(entry) {
  const row = document.createElement("tr");
  row.innerHTML = `
    <td>${formatDate(entry.timestamp)}</td>
    <td>${escapeHtml(entry.company)}</td>
    <td>${escapeHtml(entry.jobTitle)}</td>
    <td>${escapeHtml(entry.atsPlatform)}</td>
    <td>
      <select class="status-select" data-id="${entry.id}">
        ${APPLICATION_STATUSES.map(
          (status) => `<option value="${status}"${status === entry.status ? " selected" : ""}>${STATUS_LABEL[status]}</option>`
        ).join("")}
      </select>
    </td>
    <td class="history-row-actions">
      ${entry.url ? `<a href="${escapeHtml(entry.url)}" target="_blank" rel="noopener">View posting</a>` : ""}
      <button type="button" class="history-remove-btn" data-id="${entry.id}">Remove</button>
    </td>
  `;
  return row;
}

async function render() {
  const history = await loadHistory();
  const all = Object.values(history);
  const hasAny = all.length > 0;

  table.hidden = !hasAny;
  emptyState.hidden = hasAny;
  if (!hasAny) {
    tableBody.innerHTML = "";
    return;
  }

  const filtered = sortEntries(
    all.filter((entry) => matchesFilters(entry, searchInput.value.trim(), statusFilter.value)),
    sortSelect.value
  );

  tableBody.innerHTML = "";
  if (!filtered.length) {
    tableBody.innerHTML = `<tr><td colspan="6" class="hint">No applications match this filter.</td></tr>`;
    return;
  }
  filtered.forEach((entry) => tableBody.appendChild(renderRow(entry)));
}

[searchInput, statusFilter, sortSelect].forEach((el) => el.addEventListener("input", render));

tableBody.addEventListener("change", async (event) => {
  const select = event.target.closest(".status-select");
  if (!select) return;
  await updateApplicationStatus(select.dataset.id, select.value);
  render();
});

tableBody.addEventListener("click", async (event) => {
  const button = event.target.closest(".history-remove-btn");
  if (!button) return;
  if (!confirm("Remove this entry from your application history? This can't be undone.")) return;
  await deleteApplication(button.dataset.id);
  render();
});

render();
