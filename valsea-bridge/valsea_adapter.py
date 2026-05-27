import asyncio
import io
import logging
import re
import shutil
import subprocess
import wave
from typing import Any

import httpx

logger = logging.getLogger(__name__)

DEFAULT_VALSEA_TRANSCRIPTION_URL = "https://api.valsea.ai/v1/audio/transcriptions"
DEFAULT_VALSEA_TRANSCRIPTION_MODEL = "valsea-transcribe"
DEFAULT_VALSEA_TRANSCRIPTION_LANGUAGE = "english"
DEFAULT_ELEVENLABS_TTS_URL = "https://api.elevenlabs.io/v1/text-to-speech"
MIN_TURN_AUDIO_SECONDS = 2.0
FILLER_TRANSCRIPTS = {
    "ah",
    "hello",
    "hi",
    "hmm",
    "i'm sorry",
    "mhm",
    "mhmm",
    "oh",
    "okay",
    "sorry",
    "uh",
    "uh huh",
    "um",
    "yeah",
    "yep",
    "yes",
}
BILINGUAL_NAIL_SALON_PROMPT = """You are a friendly bilingual receptionist for a Vietnamese nail salon.
Your goal is to help callers book nail appointments in either English or Vietnamese.
Keep the booking flow very short.
Start by greeting the caller and asking what service they want.
If the caller speaks Vietnamese, continue in Vietnamese.
If the caller speaks English, continue in English.
If the caller switches languages, follow their language.
Your job:
1. Ask what service they want.
2. Ask for their name.
3. Confirm the service and name.
4. Keep responses short, polite, and natural.
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
Do not ask for date, time, phone, notes, language preference, or extra details unless the caller volunteers them.
Do not promise an appointment is confirmed. Say you will send the request to the salon team.
Important:
- Only collect service and name.
- Repeat the service and name before ending the call.
- Be warm and professional."""

SERVICES = [
    "manicure",
    "pedicure",
    "gel manicure",
    "gel pedicure",
    "acrylic full set",
    "acrylic refill",
    "dip powder",
    "nail design",
    "waxing",
]

VIETNAMESE_MARKERS = (
    "tiếng việt",
    "tieng viet",
    "việt",
    "viet",
    "xin chào",
    "chào",
    "làm móng",
    "móng",
    "đặt lịch",
    "lịch hẹn",
)
VIETNAMESE_CHARS = set("ăâđêôơưáàảãạấầẩẫậắằẳẵặéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵ")


class ValseaAdapter:
    """Turn-based Valsea STT + ElevenLabs TTS adapter for Twilio audio.

    Twilio Media Streams sends G.711 mu-law audio at 8 kHz. This prototype
    buffers a short caller turn, converts it to WAV for Valsea speech-to-text,
    uses the bilingual nail-salon prompt below for simple response behavior, and
    asks ElevenLabs for Twilio-compatible mu-law audio.

    This is not the same as a true realtime bidirectional Valsea voice-agent API.
    If Valsea provides a realtime streaming API, prefer that for production phone
    agents because it will have lower latency and better turn handling.
    """

    def __init__(
        self,
        api_key: str | None = None,
        agent_id: str | None = None,
        agent_prompt: str | None = None,
        transcription_url: str = DEFAULT_VALSEA_TRANSCRIPTION_URL,
        transcription_model: str | None = DEFAULT_VALSEA_TRANSCRIPTION_MODEL,
        transcription_language: str | None = DEFAULT_VALSEA_TRANSCRIPTION_LANGUAGE,
        llm_api_key: str | None = None,
        llm_base_url: str | None = None,
        llm_model: str | None = None,
        transcript_webhook_url: str | None = None,
        elevenlabs_api_key: str | None = None,
        elevenlabs_voice_id: str | None = None,
        elevenlabs_model_id: str = "eleven_turbo_v2_5",
        elevenlabs_output_format: str = "ulaw_8000",
        elevenlabs_tts_url: str = DEFAULT_ELEVENLABS_TTS_URL,
        local_tts_fallback: bool = True,
        sample_rate: int = 8000,
        turn_audio_seconds: float = 3.0,
        http_timeout_seconds: float = 30.0,
    ) -> None:
        self.api_key = api_key
        self.agent_id = agent_id
        self.agent_prompt = agent_prompt or BILINGUAL_NAIL_SALON_PROMPT
        self.transcription_url = transcription_url
        self.transcription_model = transcription_model or DEFAULT_VALSEA_TRANSCRIPTION_MODEL
        self.transcription_language = normalize_valsea_language(transcription_language) or DEFAULT_VALSEA_TRANSCRIPTION_LANGUAGE
        self.llm_api_key = llm_api_key
        self.llm_base_url = (llm_base_url or "https://api.openai.com/v1").rstrip("/")
        self.llm_model = llm_model
        self.transcript_webhook_url = transcript_webhook_url
        self.elevenlabs_api_key = elevenlabs_api_key
        self.elevenlabs_voice_id = elevenlabs_voice_id
        self.elevenlabs_model_id = elevenlabs_model_id
        self.elevenlabs_output_format = elevenlabs_output_format
        self.elevenlabs_tts_url = elevenlabs_tts_url.rstrip("/")
        self.local_tts_fallback = local_tts_fallback
        self.sample_rate = sample_rate
        self.turn_audio_seconds = max(turn_audio_seconds, MIN_TURN_AUDIO_SECONDS)
        self.http_timeout_seconds = http_timeout_seconds

        self.connected = False
        self.call_id: str | None = None
        self.language: str | None = None
        self.booking_details: dict[str, str] = {}
        self.conversation: list[dict[str, str]] = [
            {"role": "system", "content": self.agent_prompt},
        ]
        self._buffer = bytearray()
        self._processing_lock = asyncio.Lock()
        self._has_greeted = False
        self._confirmed_request = False
        self._finished_call = False
        self._last_accepted_transcript: str | None = None

    async def connect(self) -> None:
        """Prepare the adapter for a call."""
        self.connected = True
        self._buffer.clear()
        logger.info("Valsea STT + ElevenLabs TTS adapter ready")

        if not self.api_key:
            logger.warning("VALSEA_API_KEY is not set; speech-to-text is disabled")
        if not self.llm_api_key or not self.llm_model:
            logger.warning("LLM_API_KEY/OPENAI_API_KEY or LLM_MODEL is not set; using rule-based replies")
        if self.transcript_webhook_url:
            logger.info("Live transcript webhook forwarding is enabled")
        if not self.elevenlabs_api_key:
            logger.warning("ELEVENLABS_API_KEY is not set; ElevenLabs text-to-speech is disabled")
        if not self.elevenlabs_voice_id:
            logger.info("ELEVENLABS_VOICE_ID is not set; the first available ElevenLabs voice will be used")
        if self.local_tts_fallback:
            logger.info("Local TTS fallback is enabled")

    async def initial_greeting(self) -> bytes | None:
        """Greet the caller and ask their language preference."""
        if self._has_greeted:
            return None
        self._has_greeted = True
        greeting = (
            "Hello, thank you for calling. This is the nail salon. "
            "What service would you like to book?"
        )
        await self.send_transcript_webhook("agent", greeting)
        return await self.synthesize_speech(greeting)

    def set_call_id(self, call_id: str | None) -> None:
        if call_id:
            self.call_id = call_id

    async def send_audio(self, audio: bytes) -> bytes | None:
        """Accept a Twilio media chunk and return assistant audio when available."""
        if not isinstance(audio, (bytes, bytearray)):
            raise TypeError("audio must be bytes")
        if not audio:
            return None

        self._buffer.extend(audio)
        buffered_seconds = len(self._buffer) / float(self.sample_rate)
        if buffered_seconds < self.turn_audio_seconds:
            return None

        if self._processing_lock.locked():
            return None

        caller_audio = bytes(self._buffer)
        self._buffer.clear()

        if is_probably_silence(caller_audio):
            logger.debug("Ignoring quiet caller audio chunk")
            return None

        async with self._processing_lock:
            transcript = await self.transcribe_audio(caller_audio)
            if not transcript or not self.should_accept_transcript(transcript):
                return None

            await self.send_transcript_webhook("user", transcript)
            reply_text = await self.generate_reply(transcript)
            if not reply_text:
                return None

            await self.send_transcript_webhook("agent", reply_text)
            return await self.synthesize_speech(reply_text)

    async def flush_buffered_transcript(self) -> None:
        """Transcribe any remaining caller audio before marking the call ended."""
        if len(self._buffer) < int(self.sample_rate * 0.25):
            return

        caller_audio = bytes(self._buffer)
        self._buffer.clear()

        if is_probably_silence(caller_audio):
            return

        async with self._processing_lock:
            transcript = await self.transcribe_audio(caller_audio)
            if transcript and self.should_accept_transcript(transcript):
                await self.send_transcript_webhook("user", transcript)

    def should_accept_transcript(self, transcript: str) -> bool:
        """Reject repeated filler/noise fragments before they reach the call flow."""
        normalized = normalize_transcript_for_filter(transcript)
        if not normalized:
            return False

        if normalized == self._last_accepted_transcript:
            logger.info("Ignoring repeated transcript fragment: %s", transcript)
            return False

        if normalized in FILLER_TRANSCRIPTS:
            logger.info("Ignoring filler transcript fragment: %s", transcript)
            return False

        words = normalized.split()
        mentions_service = any(service in normalized for service in SERVICES)
        looks_like_name = bool(re.search(r"\b(my name is|name is|tên tôi là|tôi tên|mình tên|em tên)\b", normalized))

        if len(words) < 2 and not mentions_service and not looks_like_name:
            logger.info("Ignoring too-short transcript fragment: %s", transcript)
            return False

        self._last_accepted_transcript = normalized
        return True

    async def finish_call(self) -> None:
        if self._finished_call:
            return
        self._finished_call = True
        await self.flush_buffered_transcript()
        await self.send_transcript_webhook("agent", "Call ended.", last_message=True)

    async def send_transcript_webhook(
        self,
        role: str,
        message: str,
        last_message: bool = False,
    ) -> None:
        """Forward call transcript lines to the dashboard webhook."""
        if not self.transcript_webhook_url or not self.call_id:
            return

        payload = {
            "call_id": self.call_id,
            "role": role,
            "message": message,
            "last_message": last_message,
        }

        try:
            async with httpx.AsyncClient(timeout=self.http_timeout_seconds) as client:
                response = await client.post(self.transcript_webhook_url, json=payload)
                response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            logger.error(
                "Transcript webhook failed with HTTP %s: %s",
                exc.response.status_code,
                exc.response.text[:500],
            )
        except httpx.HTTPError as exc:
            logger.error("Transcript webhook request failed: %s", exc)

    async def generate_reply(self, transcript: str) -> str:
        """Generate the assistant reply with an LLM when configured, else fallback locally."""
        if not self.llm_api_key or not self.llm_model:
            return self.build_agent_reply(transcript)

        self.conversation.append({"role": "user", "content": transcript})
        messages = self.conversation[-11:]
        if messages[0].get("role") != "system":
            messages = [self.conversation[0], *messages]

        payload = {
            "model": self.llm_model,
            "messages": messages,
            "temperature": 0.4,
            "max_tokens": 120,
        }
        headers = {
            "Authorization": f"Bearer {self.llm_api_key}",
            "Content-Type": "application/json",
        }

        try:
            async with httpx.AsyncClient(timeout=self.http_timeout_seconds) as client:
                response = await client.post(
                    f"{self.llm_base_url}/chat/completions",
                    headers=headers,
                    json=payload,
                )
                response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            logger.error(
                "LLM reply failed with HTTP %s: %s",
                exc.response.status_code,
                exc.response.text[:500],
            )
            return self.build_agent_reply(transcript)
        except httpx.HTTPError as exc:
            logger.error("LLM reply request failed: %s", exc)
            return self.build_agent_reply(transcript)

        try:
            result = response.json()
            reply = result["choices"][0]["message"]["content"].strip()
        except (KeyError, IndexError, TypeError, ValueError):
            logger.error("LLM reply response did not contain choices[0].message.content")
            return self.build_agent_reply(transcript)

        if not reply:
            return self.build_agent_reply(transcript)

        self.conversation.append({"role": "assistant", "content": reply})
        logger.info("Assistant reply: %s", reply)
        return reply

    async def transcribe_audio(self, mulaw_audio: bytes) -> str | None:
        """Transcribe one buffered caller turn with Valsea's file STT endpoint."""
        if not self.api_key:
            return None

        wav_audio = mulaw_8000_to_wav(mulaw_audio, sample_rate=self.sample_rate)
        data: dict[str, str] = {"model": self.transcription_model}
        if self.transcription_language:
            data["language"] = self.transcription_language
        if self.agent_id:
            data["agent_id"] = self.agent_id

        files = {
            "file": ("twilio-call.wav", wav_audio, "audio/wav"),
        }
        headers = {
            "Authorization": f"Bearer {self.api_key}",
        }

        try:
            async with httpx.AsyncClient(timeout=self.http_timeout_seconds) as client:
                response = await client.post(
                    self.transcription_url,
                    headers=headers,
                    data=data,
                    files=files,
                )
                response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            logger.error(
                "Valsea transcription failed with HTTP %s: %s",
                exc.response.status_code,
                exc.response.text[:500],
            )
            return None
        except httpx.HTTPError as exc:
            logger.error("Valsea transcription request failed: %s", exc)
            return None

        try:
            result = response.json()
        except ValueError:
            text = response.text.strip()
            return text or None

        transcript = extract_transcript_text(result)
        if transcript:
            logger.info("Caller transcript: %s", transcript)
        else:
            logger.warning("Valsea transcription response did not contain text")
        return transcript

    def build_agent_reply(self, transcript: str) -> str:
        """Respond according to the bilingual Vietnamese nail salon prompt."""
        self._update_language(transcript)
        self._update_booking_details(transcript)

        language = self.language or "en"
        missing = [
            field
            for field in ("service", "name")
            if not self.booking_details.get(field)
        ]

        if missing:
            return self._ask_for_field(language, missing[0])

        if not self._confirmed_request:
            self._confirmed_request = True
            return self._confirmation(language)

        return self._say(
            language,
            en="Thank you. I will send this request to the salon team for confirmation.",
            vi="Cảm ơn quý khách. Em sẽ gửi yêu cầu này cho tiệm để xác nhận lại ạ.",
        )

    def _update_language(self, transcript: str) -> None:
        lower = transcript.lower()
        if "english" in lower or "tiếng anh" in lower or "tieng anh" in lower:
            self.language = "en"
            return
        if any(marker in lower for marker in VIETNAMESE_MARKERS) or any(
            char in lower for char in VIETNAMESE_CHARS
        ):
            self.language = "vi"
            return
        if self.language is None:
            self.language = "en"

    def _update_booking_details(self, transcript: str) -> None:
        lower = transcript.lower()
        service_was_missing = "service" not in self.booking_details

        if "service" not in self.booking_details:
            for service in sorted(SERVICES, key=len, reverse=True):
                if service in lower:
                    self.booking_details["service"] = service
                    break
            if "móng" in lower or "nail" in lower:
                self.booking_details.setdefault("service", "nail service")
            if "wax" in lower:
                self.booking_details.setdefault("service", "waxing")
            if "service" not in self.booking_details and not self._is_language_only_answer(lower):
                self.booking_details["service"] = transcript.strip(" .,!?")

        name_patterns = [
            r"my name is\s+([A-Za-zÀ-ỹ' -]{2,40})",
            r"name is\s+([A-Za-zÀ-ỹ' -]{2,40})",
            r"tên tôi là\s+([A-Za-zÀ-ỹ' -]{2,40})",
            r"tôi tên\s+([A-Za-zÀ-ỹ' -]{2,40})",
            r"mình tên\s+([A-Za-zÀ-ỹ' -]{2,40})",
            r"em tên\s+([A-Za-zÀ-ỹ' -]{2,40})",
        ]
        for pattern in name_patterns:
            match = re.search(pattern, transcript, flags=re.IGNORECASE)
            if match:
                name = match.group(1).strip(" .,!?")
                if name:
                    self.booking_details["name"] = name
                    break

        if (
            "name" not in self.booking_details
            and not service_was_missing
            and not self._is_language_only_answer(lower)
        ):
            self.booking_details["name"] = transcript.strip(" .,!?")

    def _is_language_only_answer(self, lower: str) -> bool:
        return lower.strip(" .,!?") in {
            "english",
            "tiếng anh",
            "tieng anh",
            "vietnamese",
            "tiếng việt",
            "tieng viet",
        }

    def _looks_like_date_or_time(self, lower: str) -> bool:
        date_time_terms = (
            "today",
            "tomorrow",
            "monday",
            "tuesday",
            "wednesday",
            "thursday",
            "friday",
            "saturday",
            "sunday",
            "am",
            "pm",
            "morning",
            "afternoon",
            "evening",
            "hôm nay",
            "ngày mai",
            "thứ hai",
            "thứ ba",
            "thứ tư",
            "thứ năm",
            "thứ sáu",
            "thứ bảy",
            "chủ nhật",
            "sáng",
            "chiều",
            "tối",
        )
        return any(term in lower for term in date_time_terms) or bool(re.search(r"\b\d{1,2}(:\d{2})?\b", lower))

    def _requested_time_may_be_unavailable(self, transcript: str) -> bool:
        lower = transcript.lower()
        late_time = re.search(r"\b(7:30|8|8:00|8:30|9|9:00|10|10:00)\s*(pm|p\.m\.|tối)\b", lower)
        early_time = re.search(r"\b([1-9])(:\d{2})?\s*(am|a\.m\.|sáng)\b", lower)
        return bool(late_time or early_time)

    def _ask_for_field(self, language: str, field: str) -> str:
        prompts = {
            "service": {
                "en": "What nail service would you like to book?",
                "vi": "Quý khách muốn đặt dịch vụ nào ạ?",
            },
            "date_time": {
                "en": "What date and time would you prefer?",
                "vi": "Quý khách muốn đặt ngày và giờ nào ạ?",
            },
            "name": {
                "en": "May I have your name, please?",
                "vi": "Cho em xin tên của quý khách ạ?",
            },
        }
        return prompts[field]["vi" if language == "vi" else "en"]

    def _confirmation(self, language: str) -> str:
        service = self.booking_details.get("service", "the service")
        name = self.booking_details.get("name", "the customer")

        return self._say(
            language,
            en=(
                f"Got it. {name} for {service}. "
                "I will send this request to the salon team for confirmation."
            ),
            vi=(
                f"Em xin nhắc lại: tên {name}, dịch vụ {service}. "
                "Em sẽ gửi yêu cầu này cho tiệm để xác nhận lại ạ."
            ),
        )

    def _say(self, language: str, en: str, vi: str) -> str:
        return vi if language == "vi" else en

    async def synthesize_speech(self, text: str) -> bytes | None:
        """Synthesize assistant speech with ElevenLabs."""
        if not self.elevenlabs_api_key:
            return await self.synthesize_speech_locally(text)

        voice_id = await self.resolve_elevenlabs_voice_id()
        if not voice_id:
            return await self.synthesize_speech_locally(text)

        url = f"{self.elevenlabs_tts_url}/{voice_id}"
        headers = {
            "xi-api-key": self.elevenlabs_api_key,
            "Content-Type": "application/json",
            "Accept": "audio/basic" if self.elevenlabs_output_format.startswith("ulaw") else "audio/mpeg",
        }
        payload = {
            "text": text,
            "model_id": self.elevenlabs_model_id,
            "voice_settings": {
                "stability": 0.5,
                "similarity_boost": 0.75,
            },
        }
        params = {
            "output_format": self.elevenlabs_output_format,
        }

        try:
            async with httpx.AsyncClient(timeout=self.http_timeout_seconds) as client:
                response = await client.post(url, headers=headers, params=params, json=payload)
                response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            logger.error(
                "ElevenLabs TTS failed with HTTP %s: %s",
                exc.response.status_code,
                exc.response.text[:500],
            )
            return await self.synthesize_speech_locally(text)
        except httpx.HTTPError as exc:
            logger.error("ElevenLabs TTS request failed: %s", exc)
            return await self.synthesize_speech_locally(text)

        audio = response.content
        logger.info("Generated %s bytes of ElevenLabs audio", len(audio))
        return audio or None

    async def synthesize_speech_locally(self, text: str) -> bytes | None:
        """Fallback TTS using espeak-ng and ffmpeg to produce Twilio-ready raw mu-law."""
        if not self.local_tts_fallback:
            return None
        if not shutil.which("espeak-ng") or not shutil.which("ffmpeg"):
            logger.error("Local TTS fallback requires espeak-ng and ffmpeg on PATH")
            return None

        safe_text = re.sub(r"\s+", " ", text).strip()
        if not safe_text:
            return None

        try:
            espeak = await asyncio.create_subprocess_exec(
                "espeak-ng",
                "-v",
                "en-us",
                "-s",
                "155",
                "-p",
                "45",
                "--stdout",
                safe_text,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            ffmpeg = await asyncio.create_subprocess_exec(
                "ffmpeg",
                "-hide_banner",
                "-loglevel",
                "error",
                "-i",
                "pipe:0",
                "-f",
                "mulaw",
                "-ar",
                str(self.sample_rate),
                "-ac",
                "1",
                "pipe:1",
                stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            wav_audio, espeak_stderr = await espeak.communicate()
            mulaw_audio, ffmpeg_stderr = await ffmpeg.communicate(wav_audio)
        except (OSError, subprocess.SubprocessError) as exc:
            logger.error("Local TTS fallback failed to start: %s", exc)
            return None

        if espeak.returncode != 0:
            logger.error("Local TTS espeak-ng failed: %s", espeak_stderr.decode(errors="replace")[:500])
            return None
        if ffmpeg.returncode != 0:
            logger.error("Local TTS ffmpeg failed: %s", ffmpeg_stderr.decode(errors="replace")[:500])
            return None

        logger.info("Generated %s bytes of local fallback TTS audio", len(mulaw_audio))
        return mulaw_audio or None

    async def resolve_elevenlabs_voice_id(self) -> str | None:
        """Use configured voice ID, or discover the first available account voice."""
        if self.elevenlabs_voice_id:
            return self.elevenlabs_voice_id
        if not self.elevenlabs_api_key:
            return None

        headers = {
            "xi-api-key": self.elevenlabs_api_key,
        }

        try:
            async with httpx.AsyncClient(timeout=self.http_timeout_seconds) as client:
                response = await client.get("https://api.elevenlabs.io/v1/voices", headers=headers)
                response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            logger.error(
                "ElevenLabs voice lookup failed with HTTP %s: %s",
                exc.response.status_code,
                exc.response.text[:500],
            )
            return None
        except httpx.HTTPError as exc:
            logger.error("ElevenLabs voice lookup request failed: %s", exc)
            return None

        try:
            voices = response.json().get("voices", [])
            voice = next(item for item in voices if item.get("voice_id"))
        except (StopIteration, AttributeError, ValueError):
            logger.error("ElevenLabs voice lookup did not return any voices")
            return None

        self.elevenlabs_voice_id = voice["voice_id"]
        logger.info("Using ElevenLabs voice %s (%s)", self.elevenlabs_voice_id, voice.get("name", "unnamed"))
        return self.elevenlabs_voice_id

    async def close(self) -> None:
        """Close the adapter for this call."""
        self.connected = False
        self._buffer.clear()
        logger.info("Valsea STT + ElevenLabs TTS adapter closed")


def normalize_valsea_language(language: str | None) -> str | None:
    """Map common short language codes to Valsea's expected language names."""
    if language is None:
        return None

    normalized = language.strip().lower().replace("_", "-")
    if not normalized or normalized in {"auto", "auto-detect", "detect", "multilingual"}:
        return None

    aliases = {
        "en": "english",
        "en-us": "english",
        "en-gb": "english",
        "vi": "vietnamese",
        "vi-vn": "vietnamese",
        "vn": "vietnamese",
        "tieng-viet": "vietnamese",
        "tiếng-việt": "vietnamese",
    }
    return aliases.get(normalized, normalized)


def normalize_transcript_for_filter(transcript: str) -> str:
    normalized = transcript.strip().lower()
    normalized = re.sub(r"[^\w\sÀ-ỹ'-]", " ", normalized, flags=re.UNICODE)
    normalized = re.sub(r"\s+", " ", normalized)
    return normalized.strip(" '-")


def is_probably_silence(mulaw_audio: bytes, threshold: int = 160, min_quiet_ratio: float = 0.94) -> bool:
    """Detect Twilio μ-law silence/noise before sending it to STT."""
    if not mulaw_audio:
        return True

    samples = [
        abs(_decode_mulaw_sample(value))
        for value in mulaw_audio[:: max(1, len(mulaw_audio) // 800)]
    ]
    if not samples:
        return True

    quiet_samples = sum(1 for sample in samples if sample <= threshold)
    return quiet_samples / len(samples) >= min_quiet_ratio


def mulaw_8000_to_wav(mulaw_audio: bytes, sample_rate: int = 8000) -> bytes:
    """Convert raw 8 kHz mu-law audio bytes into a mono PCM WAV file."""
    pcm_audio = mulaw_to_pcm16(mulaw_audio)
    output = io.BytesIO()
    with wave.open(output, "wb") as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(sample_rate)
        wav_file.writeframes(pcm_audio)
    return output.getvalue()


def mulaw_to_pcm16(mulaw_audio: bytes) -> bytes:
    """Decode G.711 mu-law bytes to little-endian signed 16-bit PCM."""
    pcm = bytearray()
    for value in mulaw_audio:
        decoded = _decode_mulaw_sample(value)
        pcm.extend(int(decoded).to_bytes(2, byteorder="little", signed=True))
    return bytes(pcm)


def _decode_mulaw_sample(value: int) -> int:
    value = (~value) & 0xFF
    sign = value & 0x80
    exponent = (value >> 4) & 0x07
    mantissa = value & 0x0F
    sample = ((mantissa << 3) + 0x84) << exponent
    sample -= 0x84
    return -sample if sign else sample


def extract_transcript_text(data: Any) -> str | None:
    """Find transcript text in common STT JSON response shapes."""
    if isinstance(data, str):
        return data.strip() or None

    if isinstance(data, dict):
        for key in ("text", "transcript", "transcription", "content"):
            value = data.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()

        segments = data.get("segments")
        if isinstance(segments, list):
            segment_text = " ".join(
                item.get("text", "").strip()
                for item in segments
                if isinstance(item, dict) and isinstance(item.get("text"), str)
            ).strip()
            if segment_text:
                return segment_text

        for value in data.values():
            nested = extract_transcript_text(value)
            if nested:
                return nested

    if isinstance(data, list):
        parts = [extract_transcript_text(item) for item in data]
        text = " ".join(part for part in parts if part).strip()
        return text or None

    return None
