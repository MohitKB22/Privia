#!/usr/bin/env python3
"""Smoke-test a frozen backend sidecar exactly the way the desktop shell runs it.

    python packaging/backend/smoke_test.py path/to/privia-backend-<triple>[.exe]

Checks, in a throwaway data directory:

1. it starts and answers ``/health`` within the time limit,
2. it refuses ``/api/v1/status`` without the per-launch token and serves it with it,
3. it created and migrated its SQLite database from the bundled SQL files,
4. it refuses a foreign ``Host`` header (DNS-rebinding protection),
5. it exits on its own once its stdin closes, as it does when the shell quits.

Exit code 0 means every check passed.
"""

from __future__ import annotations

import json
import os
import secrets
import socket
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request

START_TIMEOUT = 60.0
EXIT_TIMEOUT = 15.0


def free_port() -> int:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


def request(port: int, path: str, token: str | None = None, host: str | None = None):
    headers = {}
    if token:
        headers["authorization"] = f"Bearer {token}"
    if host:
        headers["host"] = host
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    req = urllib.request.Request(f"http://127.0.0.1:{port}{path}", headers=headers)
    try:
        with opener.open(req, timeout=5) as response:
            return response.status, json.loads(response.read() or b"null")
    except urllib.error.HTTPError as exc:
        return exc.code, None


def main(binary: str) -> int:
    token = secrets.token_hex(32)
    port = free_port()
    failures: list[str] = []

    with tempfile.TemporaryDirectory() as data_dir:
        env = dict(
            os.environ,
            PRIVIA_DATA_DIR=data_dir,
            PRIVIA_API_TOKEN=token,
            PRIVIA_EXIT_ON_STDIN_EOF="1",
            APP_ENV="production",
            STT_PROVIDER="disabled",
        )
        started = time.monotonic()
        process = subprocess.Popen(
            [binary, "--host", "127.0.0.1", "--port", str(port)],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            env=env,
        )
        try:
            health = None
            while time.monotonic() - started < START_TIMEOUT:
                if process.poll() is not None:
                    break
                try:
                    health = request(port, "/health")
                    break
                except OSError:
                    time.sleep(0.25)
            if not health or health[0] != 200:
                failures.append(f"did not answer /health within {START_TIMEOUT:.0f}s")
            else:
                print(
                    f"ok   /health in {time.monotonic() - started:.1f}s (v{health[1]['version']})"
                )

                code, _ = request(port, "/api/v1/status")
                (print if code == 401 else failures.append)(
                    f"{'ok  ' if code == 401 else ''} /api/v1/status without token -> {code}"
                )
                code, body = request(port, "/api/v1/status", token=token)
                schema = (body or {}).get("database", {}).get("schema_version", 0)
                if code == 200 and schema > 0:
                    print(f"ok   /api/v1/status with token, database schema v{schema}")
                else:
                    failures.append(f"/api/v1/status with token -> {code}, schema {schema}")
                code, _ = request(port, "/health", host="attacker.example")
                if code == 403:
                    print("ok   foreign Host header refused")
                else:
                    failures.append(f"foreign Host header -> {code} (expected 403)")
        finally:
            assert process.stdin is not None
            process.stdin.close()  # what happens when the desktop shell exits
            try:
                process.wait(timeout=EXIT_TIMEOUT)
                print(f"ok   exited with code {process.returncode} after stdin closed")
            except subprocess.TimeoutExpired:
                failures.append(f"still running {EXIT_TIMEOUT:.0f}s after stdin closed")
                process.kill()
            output = process.stdout.read().decode(errors="replace") if process.stdout else ""

    if failures:
        print("\nFAILED:\n  " + "\n  ".join(failures))
        print("\nLast output:\n" + "\n".join(output.splitlines()[-25:]))
        return 1
    print("sidecar smoke test passed")
    return 0


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    sys.exit(main(sys.argv[1]))
