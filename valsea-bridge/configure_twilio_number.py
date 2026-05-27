import asyncio
import os
import sys
from typing import Any

import httpx
from dotenv import load_dotenv

from twilio_utils import public_base_url_to_http_url

TWILIO_API_BASE = "https://api.twilio.com/2010-04-01"


def require_env(name: str) -> str:
    value = os.getenv(name)
    if value is None or value.strip() == "":
        raise RuntimeError(f"{name} is required")
    return value.strip()


def twilio_number_sid_from_url(url: str) -> str | None:
    marker = "/IncomingPhoneNumbers/"
    if marker not in url:
        return None
    suffix = url.split(marker, 1)[1]
    return suffix.split(".json", 1)[0] or None


async def find_twilio_number_sid(
    client: httpx.AsyncClient,
    account_sid: str,
    phone_number: str,
) -> str:
    response = await client.get(
        f"{TWILIO_API_BASE}/Accounts/{account_sid}/IncomingPhoneNumbers.json",
        params={"PhoneNumber": phone_number},
    )
    response.raise_for_status()
    payload = response.json()
    numbers = payload.get("incoming_phone_numbers", [])

    if len(numbers) != 1:
        raise RuntimeError(f"Expected exactly one Twilio number matching {phone_number}, found {len(numbers)}")

    sid = numbers[0].get("sid")
    if not sid:
        raise RuntimeError(f"Twilio did not return a SID for {phone_number}")
    return sid


async def update_twilio_number(client: httpx.AsyncClient, account_sid: str, number_sid: str, voice_url: str) -> dict[str, Any]:
    response = await client.post(
        f"{TWILIO_API_BASE}/Accounts/{account_sid}/IncomingPhoneNumbers/{number_sid}.json",
        data={
            "VoiceUrl": voice_url,
            "VoiceMethod": "POST",
        },
    )
    response.raise_for_status()
    return response.json()


async def configure_twilio_number(env: dict[str, str] | None = None) -> dict[str, Any]:
    source = env or os.environ
    account_sid = source.get("TWILIO_ACCOUNT_SID", "").strip()
    auth_token = source.get("TWILIO_AUTH_TOKEN", "").strip()
    public_base_url = source.get("PUBLIC_BASE_URL", "").strip()
    number_sid = source.get("TWILIO_PHONE_NUMBER_SID", "").strip()
    phone_number = source.get("TWILIO_PHONE_NUMBER", "").strip()

    if not account_sid:
        raise RuntimeError("TWILIO_ACCOUNT_SID is required")
    if not auth_token:
        raise RuntimeError("TWILIO_AUTH_TOKEN is required")
    if not public_base_url:
        raise RuntimeError("PUBLIC_BASE_URL is required")

    voice_url = public_base_url_to_http_url(public_base_url)

    async with httpx.AsyncClient(auth=(account_sid, auth_token), timeout=30.0) as client:
        if not number_sid:
            if not phone_number:
                raise RuntimeError("TWILIO_PHONE_NUMBER_SID or TWILIO_PHONE_NUMBER is required")
            number_sid = await find_twilio_number_sid(client, account_sid, phone_number)

        return await update_twilio_number(client, account_sid, number_sid, voice_url)


async def main() -> int:
    load_dotenv()

    try:
        updated = await configure_twilio_number()
        print(f"Updated Twilio number {updated.get('sid')}")
        print(f"Voice webhook: {updated.get('voice_method', 'POST')} {updated.get('voice_url')}")
        return 0
    except (RuntimeError, httpx.HTTPError, ValueError) as exc:
        print(f"Failed to configure Twilio number: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
