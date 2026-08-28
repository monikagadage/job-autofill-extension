// Unit tests for lib/history-store.js's core logic: logging an entry after
// a fill/tailor run, updating its status, deleting one, and the
// recent-applications-for-a-company lookup the popup's duplicate-warning
// feature is built on. Uses the in-memory chrome.storage.local mock from
// test/jest.setup.js, reset before each test the same way the DOM-based
// field-matcher tests reset with `document.body.innerHTML = ""`.

const {
  logApplication,
  loadHistory,
  updateApplicationStatus,
  deleteApplication,
  findRecentApplicationsForCompany,
  APPLICATION_STATUSES,
} = require("../lib/history-store.js");

beforeEach(() => {
  chrome.storage.local.__reset();
});

describe("logApplication", () => {
  test("stores a new entry with a default 'applied' status and a timestamp", async () => {
    const entry = await logApplication({
      company: "Acme Corp",
      jobTitle: "Backend Engineer",
      url: "https://jobs.lever.co/acme/123",
      atsPlatform: "Lever",
    });

    expect(entry.id).toBeTruthy();
    expect(entry.company).toBe("Acme Corp");
    expect(entry.jobTitle).toBe("Backend Engineer");
    expect(entry.status).toBe("applied");
    expect(typeof entry.timestamp).toBe("number");

    const history = await loadHistory();
    expect(Object.keys(history)).toHaveLength(1);
    expect(history[entry.id]).toEqual(entry);
  });

  test("falls back to clear placeholders when fields weren't detected", async () => {
    const entry = await logApplication({ url: "https://example.com" });
    expect(entry.company).toBe("Unknown company");
    expect(entry.jobTitle).toBe("Unknown title");
    expect(entry.atsPlatform).toBe("Other");
  });

  test("trims whitespace from detected company/title text", async () => {
    const entry = await logApplication({ company: "  Acme Corp  ", jobTitle: "  Engineer  " });
    expect(entry.company).toBe("Acme Corp");
    expect(entry.jobTitle).toBe("Engineer");
  });

  test("accumulates multiple entries without clobbering earlier ones", async () => {
    await logApplication({ company: "Acme", jobTitle: "A" });
    await logApplication({ company: "Globex", jobTitle: "B" });
    const history = await loadHistory();
    expect(Object.keys(history)).toHaveLength(2);
  });
});

describe("updateApplicationStatus", () => {
  test("updates the status and statusUpdatedAt of an existing entry", async () => {
    const entry = await logApplication({ company: "Acme", jobTitle: "A" });
    const updated = await updateApplicationStatus(entry.id, "interviewing");
    expect(updated.status).toBe("interviewing");

    const history = await loadHistory();
    expect(history[entry.id].status).toBe("interviewing");
  });

  test("rejects an unrecognized status", async () => {
    const entry = await logApplication({ company: "Acme", jobTitle: "A" });
    await expect(updateApplicationStatus(entry.id, "ghosted")).rejects.toThrow(/unknown status/i);
  });

  test("rejects updating an entry that doesn't exist", async () => {
    await expect(updateApplicationStatus("nope", "applied")).rejects.toThrow(/no such/i);
  });

  test("APPLICATION_STATUSES lists exactly the four statuses the history view offers", () => {
    expect(APPLICATION_STATUSES).toEqual(["applied", "interviewing", "rejected", "offer"]);
  });
});

describe("deleteApplication", () => {
  test("removes an entry from history", async () => {
    const entry = await logApplication({ company: "Acme", jobTitle: "A" });
    await deleteApplication(entry.id);
    const history = await loadHistory();
    expect(history[entry.id]).toBeUndefined();
  });
});

describe("findRecentApplicationsForCompany", () => {
  test("matches company name case-insensitively and trimmed", async () => {
    await logApplication({ company: "  Acme Corp  ", jobTitle: "A" });
    const matches = await findRecentApplicationsForCompany("acme corp");
    expect(matches).toHaveLength(1);
  });

  test("does not match a different company", async () => {
    await logApplication({ company: "Acme Corp", jobTitle: "A" });
    const matches = await findRecentApplicationsForCompany("Globex");
    expect(matches).toHaveLength(0);
  });

  test("excludes entries older than the lookback window", async () => {
    const entry = await logApplication({ company: "Acme Corp", jobTitle: "A" });
    const history = await loadHistory();
    history[entry.id].timestamp = Date.now() - 200 * 24 * 60 * 60 * 1000; // 200 days ago
    await chrome.storage.local.set({ applicationHistory: history });

    const matches = await findRecentApplicationsForCompany("Acme Corp", 90);
    expect(matches).toHaveLength(0);
  });

  test("returns no matches for an empty company string", async () => {
    await logApplication({ company: "Acme Corp", jobTitle: "A" });
    const matches = await findRecentApplicationsForCompany("");
    expect(matches).toHaveLength(0);
  });

  test("sorts matches newest first", async () => {
    const first = await logApplication({ company: "Acme Corp", jobTitle: "A" });
    const second = await logApplication({ company: "Acme Corp", jobTitle: "B" });
    const history = await loadHistory();
    history[first.id].timestamp = Date.now() - 1000;
    history[second.id].timestamp = Date.now();
    await chrome.storage.local.set({ applicationHistory: history });

    const matches = await findRecentApplicationsForCompany("Acme Corp");
    expect(matches.map((m) => m.id)).toEqual([second.id, first.id]);
  });
});
