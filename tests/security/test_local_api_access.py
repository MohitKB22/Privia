"""The local API must only answer PRIVIA's own client.

Loopback binding keeps other machines out but not other web pages in a browser
on this machine. These tests reproduce the two browser attacks that matter
(DNS rebinding and cross-site requests) plus local processes without the
per-launch token, and assert each one is refused before any handler runs.
"""

from __future__ import annotations

import json

import pytest
from fastapi.testclient import TestClient

from privia_api.app import create_app
from privia_api.container import build_container
from privia_shared.config import Settings

pytestmark = pytest.mark.security

TOKEN = "t" * 48


# ------------------------------------------------------------ DNS rebinding


@pytest.mark.parametrize(
    "host",
    ["evil.example", "evil.example:8756", "127.0.0.1.nip.io:8756", "0.0.0.0:8756", ""],
)
def test_foreign_host_header_is_refused(api_client, host: str) -> None:
    response = api_client.get("/api/v1/privacy/export", headers={"host": host})
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "FORBIDDEN"


def test_rebound_page_cannot_write_memory(api_client) -> None:
    before = api_client.get("/api/v1/memory").json()["count"]
    response = api_client.post(
        "/api/v1/memory",
        json={"content": "attacker planted this"},
        headers={"host": "evil.example:8756"},
    )
    assert response.status_code == 403
    assert api_client.get("/api/v1/memory").json()["count"] == before


@pytest.mark.parametrize("host", ["127.0.0.1:8756", "localhost:8756", "[::1]:8756", "LOCALHOST"])
def test_loopback_host_names_are_accepted(api_client, host: str) -> None:
    assert api_client.get("/health", headers={"host": host}).status_code == 200


def test_extra_hosts_can_be_allowed_explicitly(settings: Settings) -> None:
    object.__setattr__(settings, "privia_allowed_hosts", "privia.lan")
    app = create_app(
        settings, container=build_container(settings, offline=True, configure_logs=False)
    )
    with TestClient(app, base_url="http://privia.lan:8756") as client:
        assert client.get("/health").status_code == 200


# --------------------------------------------------------- cross-site requests


@pytest.mark.parametrize("origin", ["https://evil.example", "null", "http://localhost:9999"])
def test_cross_site_origin_is_refused(api_client, origin: str) -> None:
    response = api_client.post(
        "/api/v1/permissions",
        json={"scope": "files:read", "grant": True},
        headers={"origin": origin},
    )
    assert response.status_code == 403
    scopes = {
        s["scope"]: s["state"] for s in api_client.get("/api/v1/permissions").json()["scopes"]
    }
    # The fixture container starts with nothing granted through the API.
    assert scopes["files:read"] != "granted"


def test_simple_request_without_content_type_is_refused(api_client) -> None:
    """A `fetch(..., {mode: 'no-cors', body: new Blob([...])})` sends no Content-Type."""
    request = api_client.build_request(
        "POST",
        "/api/v1/memory",
        content=json.dumps({"content": "planted via no-cors"}).encode(),
        headers={"origin": "https://evil.example"},
    )
    request.headers.pop("content-type", None)
    assert api_client.send(request).status_code == 403


@pytest.mark.parametrize(
    "origin",
    ["tauri://localhost", "https://tauri.localhost", "http://127.0.0.1:5173"],
)
def test_desktop_and_dev_origins_are_accepted(api_client, origin: str) -> None:
    response = api_client.get("/api/v1/memory", headers={"origin": origin})
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == origin


def test_preflight_from_foreign_origin_gets_no_cors_grant(api_client) -> None:
    response = api_client.options(
        "/api/v1/chat",
        headers={
            "origin": "https://evil.example",
            "access-control-request-method": "POST",
            "access-control-request-headers": "content-type",
        },
    )
    assert "access-control-allow-origin" not in response.headers


# ------------------------------------------------------------ per-launch token


@pytest.fixture
def token_client(settings: Settings):
    object.__setattr__(settings, "privia_api_token", TOKEN)
    app = create_app(
        settings, container=build_container(settings, offline=True, configure_logs=False)
    )
    with TestClient(app, base_url="http://127.0.0.1:8756") as client:
        yield client


def test_token_is_required_when_set(token_client) -> None:
    assert token_client.get("/api/v1/memory").status_code == 401
    assert (
        token_client.get("/api/v1/memory", headers={"authorization": "Bearer wrong"}).status_code
        == 401
    )
    assert (
        token_client.get("/api/v1/memory", headers={"authorization": f"Bearer {TOKEN}"}).status_code
        == 200
    )


def test_status_is_not_public_when_a_token_is_set(token_client) -> None:
    """Status reveals the database path and model details, so it needs the token."""
    assert token_client.get("/api/v1/status").status_code == 401
    # Liveness stays public so the desktop shell can wait for start-up.
    assert token_client.get("/health").status_code == 200


def test_token_does_not_bypass_the_host_check(token_client) -> None:
    response = token_client.get(
        "/api/v1/memory",
        headers={"authorization": f"Bearer {TOKEN}", "host": "evil.example"},
    )
    assert response.status_code == 403
