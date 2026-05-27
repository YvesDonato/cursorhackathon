import { createFileRoute } from "@tanstack/react-router";
import { prisma } from "../../db";
import Groq from "groq-sdk";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

async function extractCallDetails(callId: string) {
  const messages = await prisma.callMessage.findMany({
    where: { callId },
    orderBy: { createdAt: "asc" },
  });

  const transcript = messages
    .map((m) => `${m.role === "user" ? "CUSTOMER" : "AI"}: ${m.message}`)
    .join("\n");

  let result: Awaited<ReturnType<typeof groq.chat.completions.create>>;
  try {
    result = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You are a booking detail extractor for a nail salon receptionist AI.
Your job is to extract structured booking information from a phone call transcript.

Extract only fields you are confident about. For any field you are uncertain about or
that hasn't come up in the conversation yet, return an empty string "".

Never guess or infer. Only extract what was explicitly stated by the customer.

Respond with ONLY a valid JSON object — no explanation, no markdown, no code fences.`,
        },
        {
          role: "user",
          content: `Extract booking details from the following call transcript.

<transcript>
${transcript}
</transcript>

Return a JSON object with exactly these fields:
{
  "name": "",
  "service": "",
  "requestedDate": "",
  "requestedTime": "",
  "phone": "",
  "language": "",
  "notes": ""
}

Rules:
- name: customer's full name as stated
- service: service requested (e.g. "manicure", "pedicure", "full set")
- requestedDate: date in YYYY-MM-DD format, or "" if not mentioned
- requestedTime: time in HH:MM 24h format, or "" if not mentioned
- phone: phone number as stated by the customer
- language: language the customer is speaking (e.g. "English", "Vietnamese")
- notes: any special requests, preferences, or other details`,
        },
      ],
    });
  } catch (err) {
    console.error("[extract] Groq API error:", err);
    return;
  }

  const raw = result.choices[0]?.message?.content ?? "";
  let parsed: Record<string, string>;
  try {
    parsed = JSON.parse(raw);
  } catch {
    console.error("[extract] Failed to parse Groq response:", raw);
    return;
  }

  const str = (v: unknown) => (typeof v === "string" ? v : "");

  await prisma.call.update({
    where: { callId },
    data: {
      name: str(parsed.name),
      service: str(parsed.service),
      requestedDate: str(parsed.requestedDate),
      requestedTime: str(parsed.requestedTime),
      phone: str(parsed.phone),
      language: str(parsed.language),
      notes: str(parsed.notes),
    },
  });

  console.log(`[extract] Updated call details for ${callId}`);
}

export const Route = createFileRoute("/api/message-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: unknown;
        try {
          body = await request.json();
        } catch (err) {
          console.error("[webhook] Failed to parse request body:", err);
          return Response.json({ error: "Invalid JSON" }, { status: 400 });
        }

        const { call_id, role, message, last_message } = body as {
          call_id: string;
          role: string;
          message: string;
          last_message: boolean;
        };

        console.log(
          `[webhook] call_id=${call_id} role=${role} last_message=${last_message}`,
        );
        console.log(`[webhook] message: ${message}`);

        try {
          await prisma.call.upsert({
            where: { callId: call_id },
            create: { callId: call_id, active: true },
            update: {},
          });

          await prisma.callMessage.create({
            data: { callId: call_id, role, message },
          });

          if (last_message) {
            await prisma.call.update({
              where: { callId: call_id },
              data: { active: false },
            });
            console.log(`[webhook] call_id=${call_id} marked inactive`);
          }
        } catch (err) {
          console.error("[webhook] DB error:", err);
          return Response.json(
            { error: "Internal server error" },
            { status: 500 },
          );
        }

        if (last_message) {
          // Await extraction so booking request has final data
          if (role === "user") {
            await extractCallDetails(call_id).catch((err) =>
              console.error("[extract] Unhandled error:", err),
            );
          }

          const call = await prisma.call.findUnique({
            where: { callId: call_id },
          });
          if (call && (call.name || call.phone)) {
            await prisma.bookingRequest.create({
              data: {
                clientName: call.name,
                service: call.service,
                requestedDate: call.requestedDate,
                requestedTime: call.requestedTime,
                originalLanguage: call.language,
                phone: call.phone,
                notes: call.notes,
                callId: call_id,
              },
            });
            console.log(`[webhook] Created BookingRequest for call ${call_id}`);
          } else {
            console.log(
              `[webhook] Skipping BookingRequest for call ${call_id} — insufficient data`,
            );
          }
        } else if (role === "user") {
          // Fire-and-forget: only extract after customer messages mid-call
          extractCallDetails(call_id).catch((err) =>
            console.error("[extract] Unhandled error:", err),
          );
        }

        return Response.json({ ok: true });
      },
    },
  },
});
