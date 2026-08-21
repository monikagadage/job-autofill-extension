// lib/claude-api.js
//
// Thin wrapper around Anthropic's Messages API
// (https://docs.anthropic.com/en/api/messages). Runs inside the background
// service worker, never inside the job site's page, so the API key is never
// exposed to that page's JavaScript.

const CLAUDE_MODEL = "claude-sonnet-5";
const API_URL = "https://api.anthropic.com/v1/messages";

const TAILOR_SYSTEM_PROMPT = `You help job seekers tailor their resume to a specific job posting.
Rules:
- Never invent experience, skills, titles, dates, or accomplishments that are not already present in the base resume.
- You MAY reorder bullets, rephrase wording, and shift emphasis to match the job posting's terminology, and reorder/trim the skills list to foreground what's relevant to this job.
- If the posting clearly wants something the base resume doesn't show, list it in a short "Gaps to consider" section at the end instead of inventing it.
- Output plain text, same overall structure as the input (sections, bullet points), ready to paste into a document. No markdown formatting like ** or #.`;

export async function tailorResume({ apiKey, resumeText, jobDescription }) {
  if (!apiKey) throw new Error("No Claude API key saved yet — add one in the extension's options page.");
  if (!resumeText) throw new Error("No base resume text saved yet — paste your resume in the extension's options page.");

  const userPrompt = [
    "Job posting:",
    '"""',
    jobDescription || "(no job description was captured from the page — tailor generally toward a strong all-purpose resume)",
    '"""',
    "",
    "Base resume:",
    '"""',
    resumeText,
    '"""',
    "",
    "Produce the tailored resume now.",
  ].join("\n");

  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 2000,
      system: TAILOR_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Claude API error ${response.status}: ${errorBody.slice(0, 300)}`);
  }

  const data = await response.json();
  const text = (data.content || []).map((block) => block.text || "").join("\n").trim();
  if (!text) throw new Error("Claude returned an empty response.");
  return text;
}
