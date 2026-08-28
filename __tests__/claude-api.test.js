// Unit tests for lib/claude-api.js: request shape, auth/no-content
// validation, and response parsing for both tailorResume() and the new
// generateCoverLetter() — with global.fetch mocked so no real network call
// happens. Same require()-an-ES-module-via-babel setup as
// __tests__/history-store.test.js (see babel.config.js).

const { tailorResume, generateCoverLetter } = require("../lib/claude-api.js");

function mockFetchOnce({ ok = true, status = 200, text = "Tailored output.", errorBody = "" } = {}) {
  global.fetch = jest.fn().mockResolvedValue({
    ok,
    status,
    text: () => Promise.resolve(errorBody),
    json: () => Promise.resolve({ content: [{ text }] }),
  });
}

afterEach(() => {
  delete global.fetch;
});

describe("tailorResume", () => {
  test("rejects when no API key is saved", async () => {
    await expect(tailorResume({ apiKey: "", resumeText: "resume", jobDescription: "job" })).rejects.toThrow(/no claude api key/i);
  });

  test("rejects when no base resume text is saved", async () => {
    await expect(tailorResume({ apiKey: "sk-ant-x", resumeText: "", jobDescription: "job" })).rejects.toThrow(/no base resume/i);
  });

  test("posts to the Messages API with the key header and the resume + job description in the prompt", async () => {
    mockFetchOnce({ text: "Tailored resume text." });

    const result = await tailorResume({ apiKey: "sk-ant-x", resumeText: "My resume", jobDescription: "Backend role at Acme" });

    expect(result).toBe("Tailored resume text.");
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    expect(options.headers["x-api-key"]).toBe("sk-ant-x");
    const body = JSON.parse(options.body);
    expect(body.messages[0].content).toContain("My resume");
    expect(body.messages[0].content).toContain("Backend role at Acme");
    expect(body.system).toMatch(/never invent/i);
  });

  test("throws a formatted error on a non-ok response", async () => {
    mockFetchOnce({ ok: false, status: 401, errorBody: "invalid x-api-key" });
    await expect(tailorResume({ apiKey: "bad-key", resumeText: "resume", jobDescription: "job" })).rejects.toThrow(/Claude API error 401.*invalid x-api-key/s);
  });

  test("throws when Claude returns an empty response", async () => {
    mockFetchOnce({ text: "" });
    await expect(tailorResume({ apiKey: "sk-ant-x", resumeText: "resume", jobDescription: "job" })).rejects.toThrow(/empty response/i);
  });
});

describe("generateCoverLetter", () => {
  test("rejects when no API key is saved", async () => {
    await expect(generateCoverLetter({ apiKey: "", resumeText: "resume", jobDescription: "job" })).rejects.toThrow(/no claude api key/i);
  });

  test("rejects when no base resume text is saved", async () => {
    await expect(generateCoverLetter({ apiKey: "sk-ant-x", resumeText: "", jobDescription: "job" })).rejects.toThrow(/no base resume/i);
  });

  test("posts a cover-letter-specific system prompt and includes the applicant's name for the sign-off", async () => {
    mockFetchOnce({ text: "Dear hiring team, ..." });

    const result = await generateCoverLetter({
      apiKey: "sk-ant-x",
      resumeText: "My resume",
      jobDescription: "Backend role at Acme",
      applicantName: "Ada Lovelace",
    });

    expect(result).toBe("Dear hiring team, ...");
    const [, options] = global.fetch.mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body.system).toMatch(/cover letter/i);
    expect(body.system).not.toBe(""); // distinct prompt from tailorResume's
    expect(body.messages[0].content).toContain("Ada Lovelace");
  });

  test("omits the sign-off line entirely when no applicant name is given", async () => {
    mockFetchOnce({ text: "Dear hiring team, ..." });
    await generateCoverLetter({ apiKey: "sk-ant-x", resumeText: "My resume", jobDescription: "job" });
    const [, options] = global.fetch.mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body.messages[0].content).not.toMatch(/sign-off/i);
  });

  test("throws a formatted error on a non-ok response", async () => {
    mockFetchOnce({ ok: false, status: 500, errorBody: "server error" });
    await expect(
      generateCoverLetter({ apiKey: "sk-ant-x", resumeText: "resume", jobDescription: "job" })
    ).rejects.toThrow(/Claude API error 500.*server error/s);
  });

  test("uses a smaller max_tokens budget than the resume call (short letter, not a resume)", async () => {
    mockFetchOnce({ text: "Dear hiring team, ..." });
    await generateCoverLetter({ apiKey: "sk-ant-x", resumeText: "resume", jobDescription: "job" });
    const [, options] = global.fetch.mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body.max_tokens).toBeLessThan(2000);
  });
});
