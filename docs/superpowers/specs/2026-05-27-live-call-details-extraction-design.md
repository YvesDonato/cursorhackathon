# Live Call Details Extraction — Design Spec

## Overview

When a call is active, each incoming webhook message triggers a background Groq extraction that progressively fills in booking details (`name`, `service`, `requestedDate`, `requestedTime`, `phone`, `language`, `notes`) directly on the `Call` row. The dashboard polls every 500ms and displays whatever has been extracted so far.

---

## Groq Prompt Engineering

This is the core of the feature. Everything else is plumbing.

### Model

Use `llama-3.3-70b-versatile` — fast, cheap, strong instruction-following for structured extraction.

### Extraction Strategy

Send the **full conversation so far** on every webhook message. Do not do incremental/delta extraction — re-extracting the whole conversation each time keeps the logic stateless and self-correcting (if Groq misread an earlier message, the next pass fixes it).

### System Prompt

```
You are a booking detail extractor for a nail salon receptionist AI.
Your job is to extract structured booking information from a phone call transcript.

Extract only fields you are confident about. For any field you are uncertain about or
that hasn't come up in the conversation yet, return an empty string "".

Never guess or infer. Only extract what was explicitly stated by the customer.

Respond with ONLY a valid JSON object — no explanation, no markdown, no code fences.
```

### User Prompt

```
Extract booking details from the following call transcript.

<transcript>
{{messages formatted as "CUSTOMER: ..." / "AI: ..." lines}}
</transcript>

Return a JSON object with exactly these fields:
{
  "name": "",        // Customer's full name
  "service": "",     // Service requested (e.g. "manicure", "pedicure", "full set")
  "requestedDate":   "", // Date in YYYY-MM-DD format, or "" if not mentioned
  "requestedTime":   "", // Time in HH:MM (24h) format, or "" if not mentioned
  "phone": "",       // Phone number as stated by customer
  "language": "",    // Language the customer is speaking (e.g. "English", "Vietnamese")
  "notes": ""        // Any special requests, preferences, or notes
}
```

### Key Prompt Engineering Decisions

**Explicit empty string semantics** — The prompt distinguishes between "not mentioned" (`""`) and "mentioned but unclear". This prevents the model from hallucinating partial data and lets the dashboard correctly render `—` for missing fields.

**Format enforcement on dates/times** — Asking for `YYYY-MM-DD` and `HH:MM` (24h) normalizes output so the frontend and DB don't need to parse freeform strings. The call happens mid-conversation so the model may only have partial info — that's fine.

**Language detection as a field** — The customer's language often becomes clear from the first message. Extracting it early lets the dashboard show the detected language immediately, which is a visible live signal that the AI is working.

**No schema validation on Groq output** — Parse the JSON with `JSON.parse()`, catch any exception, and bail silently. If a field is missing from the returned object, treat it as `""`. Do not use Zod or strict validation — the cost of a failed parse is just a missed update, and the next message will retry.

**Transcript format** — Format messages as `CUSTOMER: <text>` and `AI: <text>` (not raw role names). This is more natural to the model than `user`/`assistant` and matches how a human would read a call log.

### Example Extraction Flow

| Message # | New info heard | Fields extracted |
|-----------|---------------|-----------------|
| 1 (customer) | "Hi I'd like to book a manicure" | `service: "manicure"`, `language: "English"` |
| 2 (AI) | "Sure! What's your name?" | — |
| 3 (customer) | "My name is Linda" | `name: "Linda"` |
| 4 (AI) | "When would you like to come in?" | — |
| 5 (customer) | "This Saturday at 2pm" | `requestedDate: "2026-05-30"`, `requestedTime: "14:00"` |

Each extraction is a full re-pass of the growing transcript, so earlier fields remain populated even as new ones fill in.
