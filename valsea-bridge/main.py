import base64
import binascii
import json
import logging
import os

from dotenv import load_dotenv
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import Response

from twilio_utils import build_inbound_twiml, public_base_url_to_ws_url
from valsea_adapter import DEFAULT_VALSEA_TRANSCRIPTION_LANGUAGE, ValseaAdapter

load_dotenv()

logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO").upper())
logger = logging.getLogger(__name__)

app = FastAPI(title="Twilio Media Streams to Valsea Bridge")


def get_float_env(name: str, default: float) -> float:
    value = os.getenv(name)
    if value is None or value == "":
        return default
    try:
        return float(value)
    except ValueError:
        logger.warning("Invalid %s=%r; using %s", name, value, default)
        return default


def get_bool_env(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None or value == "":
        return default
    return value.strip().lower() not in {"0", "false", "no", "off"}


def create_adapter() -> ValseaAdapter:
    return ValseaAdapter(
        api_key=os.getenv("VALSEA_API_KEY"),
        agent_id=os.getenv("VALSEA_AGENT_ID"),
        agent_prompt=os.getenv("VALSEA_AGENT_PROMPT"),
        transcription_url=os.getenv(
            "VALSEA_TRANSCRIPTION_URL",
            "https://api.valsea.ai/v1/audio/transcriptions",
        ),
        transcription_model=os.getenv("VALSEA_TRANSCRIPTION_MODEL", "valsea-transcribe"),
        transcription_language=os.getenv(
            "VALSEA_TRANSCRIPTION_LANGUAGE",
            DEFAULT_VALSEA_TRANSCRIPTION_LANGUAGE,
        ),
        llm_api_key=os.getenv("LLM_API_KEY") or os.getenv("OPENAI_API_KEY"),
        llm_base_url=os.getenv("LLM_BASE_URL", "https://api.openai.com/v1"),
        llm_model=os.getenv("LLM_MODEL"),
        transcript_webhook_url=os.getenv("TRANSCRIPT_WEBHOOK_URL"),
        elevenlabs_api_key=os.getenv("ELEVENLABS_API_KEY"),
        elevenlabs_voice_id=os.getenv("ELEVENLABS_VOICE_ID"),
        elevenlabs_model_id=os.getenv("ELEVENLABS_MODEL_ID", "eleven_turbo_v2_5"),
        elevenlabs_output_format=os.getenv("ELEVENLABS_OUTPUT_FORMAT", "ulaw_8000"),
        local_tts_fallback=get_bool_env("LOCAL_TTS_FALLBACK", True),
        turn_audio_seconds=get_float_env("TURN_AUDIO_SECONDS", 3.0),
        http_timeout_seconds=get_float_env("HTTP_TIMEOUT_SECONDS", 30.0),
    )


async def send_twilio_media(
    websocket: WebSocket,
    stream_sid: str | None,
    audio: bytes | None,
) -> None:
    if not audio or not stream_sid:
        return

    encoded_audio = base64.b64encode(audio).decode("ascii")
    logger.info("Sending %s bytes of audio to Twilio stream %s", len(audio), stream_sid)
    await websocket.send_json(
        {
            "event": "media",
            "streamSid": stream_sid,
            "media": {"payload": encoded_audio},
        }
    )
    await websocket.send_json(
        {
            "event": "mark",
            "streamSid": stream_sid,
            "mark": {"name": "assistant-audio"},
        }
    )


@app.get("/")
async def health_check() -> dict[str, str]:
    """Simple health check for load balancers and smoke tests."""
    return {"status": "ok", "service": "twilio-valsea-bridge"}


@app.api_route("/twilio/inbound", methods=["GET", "POST"])
async def twilio_inbound() -> Response:
    """Return TwiML that connects an inbound call to the media stream."""
    public_base_url = os.getenv("PUBLIC_BASE_URL", "")

    try:
        stream_url = public_base_url_to_ws_url(public_base_url)
    except ValueError as exc:
        logger.error("Invalid PUBLIC_BASE_URL: %s", exc)
        return Response(
            content=f"Configuration error: {exc}",
            status_code=500,
            media_type="text/plain",
        )

    return Response(
        content=build_inbound_twiml(stream_url),
        media_type="application/xml",
    )


@app.websocket("/twilio/media-stream")
async def twilio_media_stream(websocket: WebSocket) -> None:
    """Bridge Twilio Media Streams JSON events to the Valsea adapter."""
    await websocket.accept()

    adapter = create_adapter()
    stream_sid: str | None = None

    try:
        await adapter.connect()

        while True:
            raw_message = await websocket.receive_text()

            try:
                data = json.loads(raw_message)
            except json.JSONDecodeError:
                logger.warning("Ignoring non-JSON WebSocket message from Twilio")
                continue

            event = data.get("event")

            if event == "connected":
                logger.info("Twilio media stream connected")

            elif event == "start":
                start = data.get("start") or {}
                stream_sid = start.get("streamSid") or data.get("streamSid")
                adapter.set_call_id(start.get("callSid") or stream_sid)
                logger.info("Twilio media stream started: %s", stream_sid)

                greeting_audio = await adapter.initial_greeting()
                await send_twilio_media(websocket, stream_sid, greeting_audio)

            elif event == "media":
                if stream_sid is None:
                    stream_sid = data.get("streamSid")

                payload = (data.get("media") or {}).get("payload")
                if not payload:
                    logger.warning("Ignoring media event without payload")
                    continue

                try:
                    inbound_audio = base64.b64decode(payload, validate=True)
                except (binascii.Error, ValueError):
                    logger.warning("Ignoring media event with invalid base64 payload")
                    continue

                outbound_audio = await adapter.send_audio(inbound_audio)
                await send_twilio_media(websocket, stream_sid, outbound_audio)

            elif event == "stop":
                logger.info("Twilio media stream stopped")
                await adapter.finish_call()
                break

            else:
                logger.debug("Ignoring unsupported Twilio event: %s", event)

    except WebSocketDisconnect:
        logger.info("Twilio media stream WebSocket disconnected")
        await adapter.finish_call()
    except Exception:
        logger.exception("Unhandled error in Twilio media stream bridge")
        await adapter.finish_call()
        await websocket.close(code=1011)
    finally:
        await adapter.finish_call()
        await adapter.close()
