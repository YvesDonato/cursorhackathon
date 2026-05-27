# NailFlow AI

A multilingual AI receptionist for nail salons.

NailFlow answers customer phone calls, transcribes the conversation, detects the customer’s language, responds using voice AI, translates the booking details into the salon owner’s preferred language, creates appointment cards, and automatically adds confirmed appointments to Google Calendar.

## Tech Stack

- Frontend: React
- Backend: TanStack Start
- Voice AI: ElevenLabs
- Phone Calls: Twilio
- AI Transcription: Speech-to-text / AI transcription service
- Calendar Integration: Google Calendar API

## Core Flow

1. Customer calls the salon phone number.
2. Twilio receives the phone call and connects it to the backend.
3. ElevenLabs handles the AI voice conversation.
4. The conversation is transcribed in real time.
5. The UI shows:
   - incoming call status
   - voice wave animation
   - live transcript
   - live language translation
6. The backend extracts appointment details:
   - customer name
   - service
   - date and time
   - notes
   - customer language
7. The booking is translated into the salon owner’s preferred language.
8. An appointment card appears in the dashboard.
9. The appointment is automatically added to Google Calendar.

## UI Flow

The dashboard has three main sections:

### 1. Live Call Panel

Shows the current phone call.

Features:

- call status
- animated voice wave
- AI receptionist status
- customer speaking language

### 2. Live Translation Panel

Shows the conversation in real time.

Example:

```txt
Customer: Hi, can I book gel extensions tomorrow after 6?
AI: Yes, we have availability at 6:30 PM tomorrow.
Owner View: Khách muốn đặt lịch nối móng gel vào 6:30 chiều mai.
```

## Live Call Transcript Webhook

ElevenLabs call transcript events can be posted to:

```text
POST /message-webhook
```

Current accepted payload:

```json
{
  "call_id": "abcd123",
  "role": "user",
  "message": "i want to book an appointment...",
  "last_message": false
}
```

`role` can be `user` or `agent`. The webhook creates the call if needed, upserts the transcript message, and marks the call inactive when `last_message` is true.

The owner dashboard polls the latest call transcript every 100 ms and renders the live messages from the database.

## Valsea Bridge

The Twilio/Valsea/ElevenLabs bridge from the Valsea repo has been merged into:

```text
valsea-bridge/
```

## Run With Cloudflare Tunnel

```bash
nix run .#tunnel
```

This prepares Prisma, pushes the SQLite schema, starts the app on port 3000, and exposes it with a temporary Cloudflare Tunnel URL.
