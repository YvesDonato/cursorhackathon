import asyncio
import os
import re
import signal
import sys

import httpx
from dotenv import load_dotenv

from configure_twilio_number import configure_twilio_number
from twilio_utils import public_base_url_to_http_url

CLOUDFLARE_URL_RE = re.compile(r"https://[A-Za-z0-9-]+\.trycloudflare\.com")


async def pipe_output(stream: asyncio.StreamReader, prefix: str, url_queue: asyncio.Queue[str]) -> None:
    while True:
        line = await stream.readline()
        if not line:
            return

        text = line.decode(errors="replace").rstrip()
        print(f"{prefix}{text}", flush=True)

        match = CLOUDFLARE_URL_RE.search(text)
        if match:
            await url_queue.put(match.group(0))


async def wait_for_tunnel_url(process: asyncio.subprocess.Process, url_queue: asyncio.Queue[str]) -> str:
    while True:
        if process.returncode is not None:
            raise RuntimeError(f"cloudflared exited before publishing a tunnel URL with code {process.returncode}")

        try:
            return await asyncio.wait_for(url_queue.get(), timeout=0.25)
        except asyncio.TimeoutError:
            continue


async def wait_for_server(url: str, process: asyncio.subprocess.Process) -> None:
    async with httpx.AsyncClient(timeout=1.0) as client:
        for _ in range(40):
            if process.returncode is not None:
                raise RuntimeError(f"uvicorn exited before becoming ready with code {process.returncode}")
            try:
                response = await client.get(url)
                if response.status_code == 200:
                    return
            except httpx.HTTPError:
                pass
            await asyncio.sleep(0.25)
    raise RuntimeError(f"uvicorn did not become ready at {url}")


async def terminate_process(process: asyncio.subprocess.Process, name: str) -> None:
    if process.returncode is not None:
        return

    process.terminate()
    try:
        await asyncio.wait_for(process.wait(), timeout=5)
    except asyncio.TimeoutError:
        print(f"{name} did not stop after SIGTERM; sending SIGKILL", file=sys.stderr)
        process.kill()
        await process.wait()


def has_twilio_number_config() -> bool:
    return bool(
        os.getenv("TWILIO_ACCOUNT_SID")
        and os.getenv("TWILIO_AUTH_TOKEN")
        and (os.getenv("TWILIO_PHONE_NUMBER") or os.getenv("TWILIO_PHONE_NUMBER_SID"))
    )


async def run() -> int:
    load_dotenv()

    host = os.getenv("HOST", "0.0.0.0")
    port = os.getenv("PORT", "8000")
    local_url = f"http://localhost:{port}"
    configure_webhook = os.getenv("CONFIGURE_TWILIO_WEBHOOK", "1").strip().lower() not in {
        "0",
        "false",
        "no",
    }

    tunnel = await asyncio.create_subprocess_exec(
        "cloudflared",
        "tunnel",
        "--url",
        local_url,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )

    url_queue: asyncio.Queue[str] = asyncio.Queue()
    tunnel_tasks = [
        asyncio.create_task(pipe_output(tunnel.stdout, "[cloudflared] ", url_queue)),
        asyncio.create_task(pipe_output(tunnel.stderr, "[cloudflared] ", url_queue)),
    ]

    server: asyncio.subprocess.Process | None = None
    stop_event = asyncio.Event()

    def request_shutdown() -> None:
        stop_event.set()

    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, request_shutdown)

    try:
        public_base_url = await wait_for_tunnel_url(tunnel, url_queue)
        voice_webhook_url = public_base_url_to_http_url(public_base_url)
        print(f"Cloudflare tunnel URL: {public_base_url}", flush=True)
        print(f"Twilio Voice webhook: POST {voice_webhook_url}", flush=True)

        env = os.environ.copy()
        env["PUBLIC_BASE_URL"] = public_base_url
        env["PYTHONPATH"] = f"{os.getcwd()}:{env.get('PYTHONPATH', '')}"

        server = await asyncio.create_subprocess_exec(
            "uvicorn",
            "main:app",
            "--host",
            host,
            "--port",
            port,
            env=env,
        )
        await wait_for_server(local_url, server)
        print(f"FastAPI bridge is running at {local_url}", flush=True)

        if configure_webhook and has_twilio_number_config():
            try:
                updated = await configure_twilio_number(env)
                print(f"Updated Twilio number {updated.get('sid')}", flush=True)
                print(f"Twilio Voice webhook is {updated.get('voice_method', 'POST')} {updated.get('voice_url')}", flush=True)
            except Exception as exc:
                print(f"Could not update Twilio webhook automatically: {exc}", file=sys.stderr, flush=True)
                print(f"Set it manually to: POST {voice_webhook_url}", flush=True)
        elif configure_webhook:
            print("Twilio credentials/number not set; set the webhook manually or fill TWILIO_* in .env.", flush=True)

        server_wait = asyncio.create_task(server.wait())
        stop_wait = asyncio.create_task(stop_event.wait())
        done, pending = await asyncio.wait(
            {server_wait, stop_wait},
            return_when=asyncio.FIRST_COMPLETED,
        )
        for task in pending:
            task.cancel()

        if server_wait in done:
            return server.returncode or 0
        return 0

    finally:
        if server is not None:
            await terminate_process(server, "uvicorn")
        await terminate_process(tunnel, "cloudflared")
        for task in tunnel_tasks:
            task.cancel()


if __name__ == "__main__":
    raise SystemExit(asyncio.run(run()))
