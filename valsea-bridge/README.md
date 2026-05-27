# FastAPI Twilio Media Streams to Valsea + ElevenLabs Bridge

This project is a minimal FastAPI bridge for Twilio Media Streams, Valsea speech-to-text, and ElevenLabs text-to-speech.

Current behavior:

- Twilio inbound calls receive TwiML that connects the call to `/twilio/media-stream`.
- The WebSocket handler parses Twilio `connected`, `start`, `media`, and `stop` events.
- Inbound Twilio media payloads are base64-decoded into G.711 μ-law 8 kHz audio bytes.
- `ValseaAdapter` buffers short caller turns, converts μ-law audio to WAV, and sends the WAV to Valsea speech-to-text.
- A simple placeholder nail-salon reply engine creates a response from the transcript.
- ElevenLabs synthesizes the response as `ulaw_8000` audio so it can be base64-encoded and sent back to Twilio Media Streams.
- `configure_twilio_number.py` can update your Twilio phone number so inbound calls hit this bridge.

This is a turn-based prototype. It is useful for proving the phone/STT/TTS plumbing, but a true realtime Valsea voice-agent API would be better for production latency and interruption handling.

## Setup

```bash
python -m venv .venv
source .venv/bin/activate
```

1. Install dependencies:

   ```bash
   pip install -r requirements.txt
   ```

2. Create your environment file:

   ```bash
   cp .env.example .env
   ```

3. Edit `.env` and add your real API keys:

   ```text
   PUBLIC_BASE_URL=https://YOUR_TUNNEL_URL
   TWILIO_ACCOUNT_SID=your_twilio_account_sid
   TWILIO_AUTH_TOKEN=your_twilio_auth_token
   TWILIO_PHONE_NUMBER=+15551234567
   VALSEA_API_KEY=your_valsea_key_here
   VALSEA_TRANSCRIPTION_LANGUAGE=english
   LLM_API_KEY=your_openai_compatible_llm_key_here
   LLM_MODEL=your_chat_model_here
   ELEVENLABS_API_KEY=your_elevenlabs_key_here
   ```

   Do not commit `.env` or paste real keys into logs.

4. Run the FastAPI app:

   ```bash
   uvicorn main:app --host 0.0.0.0 --port 8000
   ```

5. In a second terminal, expose the local app:

   ```bash
   cloudflared tunnel --url http://localhost:8000
   ```

6. Put this URL into your Twilio phone number voice webhook as HTTP POST:

   ```text
   https://YOUR_TUNNEL_URL/twilio/inbound
   ```

   Or let the helper configure the Twilio number for you:

   ```bash
   python configure_twilio_number.py
   ```

After `cloudflared` prints your public HTTPS URL, set `PUBLIC_BASE_URL` in `.env` to that URL, run `python configure_twilio_number.py`, and restart `uvicorn`.

Be careful not to introduce spaces in the Twilio URL. It must be exactly like `/twilio/inbound`.

## One-command Cloudflare Tunnel webhook runner

For a temporary Cloudflare Tunnel URL, use the tunnel runner instead of manually copying URLs:

```bash
python run_cloudflare_tunnel.py
```

With Nix:

```bash
nix run .#tunnel
```

The runner:

- starts `cloudflared tunnel --url http://localhost:8000`;
- reads the generated `https://*.trycloudflare.com` URL;
- starts `uvicorn` with `PUBLIC_BASE_URL` set to that tunnel URL;
- prints the exact Twilio Voice webhook, `POST https://.../twilio/inbound`;
- updates the Twilio phone number automatically if `.env` has `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and either `TWILIO_PHONE_NUMBER` or `TWILIO_PHONE_NUMBER_SID`.

If you do not want it to update Twilio automatically, set:

```text
CONFIGURE_TWILIO_WEBHOOK=0
```

## NixOS / Nix flake

If you use Nix, enter the development shell with:

```bash
nix develop
```

Then run the same `pip install`, `uvicorn`, and `cloudflared` commands above.

The flake also provides a runnable app from the project root:

```bash
nix run .
```

This starts `uvicorn main:app` using `HOST` and `PORT` from the environment, defaulting to `0.0.0.0:8000`.

You can validate the flake with:

```bash
nix flake check
```

To configure the Twilio number from the Nix shell:

```bash
nix develop -c python configure_twilio_number.py
```

To run the bridge through a temporary Cloudflare Tunnel and configure the Twilio webhook when credentials are present:

```bash
nix run .#tunnel
```

## Twilio endpoints

- `GET /` returns a JSON health check.
- `GET` or `POST /twilio/inbound` returns TwiML like:

  ```xml
  <Response>
    <Say>Connecting you now.</Say>
    <Connect>
      <Stream url="wss://YOUR_PUBLIC_DOMAIN/twilio/media-stream" />
    </Connect>
  </Response>
  ```

- `WebSocket /twilio/media-stream` receives live Twilio Media Streams events.

## Environment variables

| Variable | Required | Description |
| --- | --- | --- |
| `PUBLIC_BASE_URL` | Yes | Public HTTPS URL from Cloudflare Tunnel or another public host. |
| `TWILIO_ACCOUNT_SID` | Yes for phone-number setup | Twilio account SID used by `configure_twilio_number.py`. |
| `TWILIO_AUTH_TOKEN` | Yes for phone-number setup | Twilio auth token used by `configure_twilio_number.py`. |
| `TWILIO_PHONE_NUMBER` | Yes for phone-number setup unless SID is set | Twilio number in E.164 form, for example `+15551234567`. |
| `TWILIO_PHONE_NUMBER_SID` | No | Optional Twilio IncomingPhoneNumber SID. If set, the helper updates this SID directly. |
| `VALSEA_API_KEY` | Yes for STT | Valsea API key for speech-to-text. |
| `VALSEA_TRANSCRIPTION_URL` | Yes for STT | Defaults to `https://api.valsea.ai/v1/audio/transcriptions`. |
| `VALSEA_TRANSCRIPTION_MODEL` | Yes for STT | Defaults to `valsea-transcribe`, which the Valsea API expects. |
| `VALSEA_TRANSCRIPTION_LANGUAGE` | Yes for STT | Valsea requires a language value. Defaults to `english`; use values like `vietnamese`, `singlish`, `english-us`, or `english-gb` as needed. Short codes like `en`/`vi` are normalized. |
| `LLM_API_KEY` / `OPENAI_API_KEY` | No | Optional OpenAI-compatible chat API key for LLM replies. If unset, local rule-based replies are used. |
| `LLM_BASE_URL` | No | OpenAI-compatible chat API base URL. Defaults to `https://api.openai.com/v1`. |
| `LLM_MODEL` | Yes for LLM replies | Chat model name to use for replies. Required only when using an LLM. |
| `TRANSCRIPT_WEBHOOK_URL` | No | Optional dashboard webhook URL. Set to the cursorhackathon app tunnel URL plus `/message-webhook` to persist live transcripts. |
| `ELEVENLABS_API_KEY` | Yes for TTS | ElevenLabs API key. |
| `ELEVENLABS_VOICE_ID` | No | Optional ElevenLabs voice ID. If unset, the app uses the first voice returned by ElevenLabs. |
| `ELEVENLABS_MODEL_ID` | No | Defaults to `eleven_turbo_v2_5`. |
| `ELEVENLABS_OUTPUT_FORMAT` | Yes for Twilio | Use `ulaw_8000` so the output can be sent to Twilio directly. |
| `LOCAL_TTS_FALLBACK` | No | Defaults to `1`. Uses local `espeak-ng` plus `ffmpeg` to generate Twilio-ready speech when ElevenLabs is out of quota or unavailable. |
| `TURN_AUDIO_SECONDS` | No | How many seconds of caller audio to buffer before one STT/TTS turn. Defaults to `3.0`. |
| `HTTP_TIMEOUT_SECONDS` | No | Timeout for Valsea and ElevenLabs HTTP calls. Defaults to `30.0`. |

## How the audio path works

1. Twilio sends base64 μ-law 8 kHz media chunks over WebSocket.
2. The bridge base64-decodes and buffers those chunks.
3. Every `TURN_AUDIO_SECONDS`, the bridge converts the buffered μ-law bytes to a mono WAV file.
4. The WAV file is sent to Valsea speech-to-text.
5. The transcript is passed to an OpenAI-compatible LLM when `LLM_API_KEY` and `LLM_MODEL` are set; otherwise it uses the local nail-salon response function.
6. ElevenLabs converts the response text to `ulaw_8000` audio.
7. The bridge base64-encodes that audio and sends it back to Twilio as a `media` event.

## Important limitations

- This is turn-based, not true streaming conversational AI.
- The current response logic follows the bilingual prompt below with simple state tracking. Replace it with a real LLM/booking workflow when ready.
- Valsea's `audio/transcriptions` endpoint is being used here only because you requested STT first, then ElevenLabs voice. For lower-latency live phone agents, prefer a realtime bidirectional Valsea API if available.
- If Valsea returns `400 Invalid request body`, check that `VALSEA_TRANSCRIPTION_MODEL=valsea-transcribe` and that `VALSEA_TRANSCRIPTION_LANGUAGE` is a full Valsea language name such as `english` or `vietnamese`.
- Twilio outbound audio must be compatible with Media Streams. Keep ElevenLabs `ELEVENLABS_OUTPUT_FORMAT=ulaw_8000` unless you add transcoding.

## Bilingual nail salon agent prompt

This prompt is embedded as the default in `valsea_adapter.py` and can be overridden with `VALSEA_AGENT_PROMPT`:

```text
You are a friendly bilingual receptionist for a Vietnamese nail salon.
Your goal is to help callers book nail appointments in either English or Vietnamese. 
Start by greeting the caller and ask which language they prefer: English or Vietnamese.
If the caller speaks Vietnamese, continue in Vietnamese.
If the caller speaks English, continue in English.
If the caller switches languages, follow their language.
Your job:
1. Ask what service they want.
2. Ask for their preferred date and time.
3. Ask for their name.
4. Ask for their phone number.
5. Confirm the appointment details.
6. If the requested time is not available, offer another time.
7. Keep responses short, polite, and natural.
Services you can book:
- Manicure
- Pedicure
- Gel manicure
- Gel pedicure
- Acrylic full set
- Acrylic refill
- Dip powder
- Nail design
- Waxing
Salon hours:
Monday to Saturday: 10:00 AM to 7:00 PM
Sunday: 11:00 AM to 5:00 PM
Do not promise an appointment is confirmed until the booking tool says it is available.
If no booking tool is available, say you will send the request to the salon team for confirmation.
Important:
- Always collect name, phone number, service, date, and time.
- Repeat the final details before ending the call.
- Be warm and professional.
```
