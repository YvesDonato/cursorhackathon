from html import escape
from urllib.parse import urlparse, urlunparse

INBOUND_VOICE_PATH = "/twilio/inbound"
MEDIA_STREAM_PATH = "/twilio/media-stream"


def public_base_url_to_http_url(
    public_base_url: str,
    path: str = INBOUND_VOICE_PATH,
) -> str:
    """Convert PUBLIC_BASE_URL into the public HTTP webhook URL Twilio should call."""
    parsed = parse_public_base_url(public_base_url)
    if parsed.scheme not in {"http", "https"}:
        raise ValueError("PUBLIC_BASE_URL for Twilio webhooks must use http or https")

    webhook_path = "/" + path.lstrip("/")
    return urlunparse((parsed.scheme, parsed.netloc, webhook_path, "", "", ""))


def public_base_url_to_ws_url(
    public_base_url: str,
    path: str = MEDIA_STREAM_PATH,
) -> str:
    """Convert PUBLIC_BASE_URL into the WebSocket URL Twilio should stream to."""
    parsed = parse_public_base_url(public_base_url)
    scheme_map = {
        "https": "wss",
        "http": "ws",
        "wss": "wss",
        "ws": "ws",
    }
    if parsed.scheme not in scheme_map:
        allowed = ", ".join(sorted(scheme_map))
        raise ValueError(f"PUBLIC_BASE_URL scheme must be one of: {allowed}")

    stream_path = "/" + path.lstrip("/")
    return urlunparse((scheme_map[parsed.scheme], parsed.netloc, stream_path, "", "", ""))


def parse_public_base_url(public_base_url: str):
    base_url = public_base_url.strip().rstrip("/")
    if not base_url:
        raise ValueError("PUBLIC_BASE_URL is required")

    if "://" not in base_url:
        base_url = f"https://{base_url}"

    parsed = urlparse(base_url)
    if not parsed.netloc:
        raise ValueError("PUBLIC_BASE_URL must include a host")

    return parsed


def build_inbound_twiml(stream_url: str) -> str:
    """Build the TwiML response for an inbound Twilio voice call."""
    safe_stream_url = escape(stream_url, quote=True)
    return (
        "<Response>\n"
        "  <Say>Connecting you now.</Say>\n"
        "  <Connect>\n"
        f"    <Stream url=\"{safe_stream_url}\" />\n"
        "  </Connect>\n"
        "</Response>\n"
    )
