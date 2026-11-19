"""Model discovery and selection.

The local model can be changed while PRIVIA runs. The choice is stored in the
local database, so it survives restarts and beats the environment default, the
same way the other user-facing settings do.
"""

from __future__ import annotations

import re
from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel, Field

from privia_shared.enums import AuditAction
from privia_shared.errors import BadRequestError

from ..deps import ContainerDep, RequestIdDep

router = APIRouter(prefix="/api/v1/models", tags=["models"])

#: Ollama model references: ``name``, ``name:tag``, ``namespace/name:tag``.
MODEL_NAME = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._\-/]{0,79}(:[A-Za-z0-9._\-]{1,40})?$")


class LocalModelChoice(BaseModel):
    model: str = Field(min_length=1, max_length=128)


def _matches(installed: list[str], wanted: str) -> bool:
    return any(name == wanted or name == f"{wanted}:latest" for name in installed)


@router.get("", summary="Models PRIVIA can use")
async def list_models(container: ContainerDep) -> dict[str, Any]:
    local = await container.router.local_health(force=True)
    cloud = await container.router.cloud_health()
    return {
        "local_provider": container.settings.local_llm_provider,
        "ollama_url": container.settings.ollama_base_url,
        "local": local.model_dump(mode="json"),
        "installed": await container.router.installed_local_models(),
        "cloud": cloud.model_dump(mode="json") if cloud else None,
        "cloud_enabled": container.settings.cloud_processing_enabled,
    }


@router.put("/local", summary="Choose the local model")
async def choose_local_model(
    body: LocalModelChoice, container: ContainerDep, request_id: RequestIdDep
) -> dict[str, Any]:
    model = body.model.strip()
    if not MODEL_NAME.match(model):
        raise BadRequestError("That is not a valid model name.", details={"model": model})
    if container.settings.local_llm_provider != "ollama":
        raise BadRequestError("The local provider is not Ollama, so there is nothing to choose.")
    installed = await container.router.installed_local_models()
    if not installed:
        raise BadRequestError(
            "Ollama is not running or has no models. Start Ollama, then try again.",
            details={"ollama_url": container.settings.ollama_base_url},
        )
    if not _matches(installed, model):
        raise BadRequestError(
            f"'{model}' is not installed. Run: ollama pull {model}",
            details={"installed": installed},
        )

    previous = container.settings.local_llm_model
    container.repositories.settings.set("local_llm_model", model)
    object.__setattr__(container.settings, "local_llm_model", model)
    container.router.set_local_model(model)
    container.audit.record(
        AuditAction.SETTINGS_CHANGED,
        target="local_llm_model",
        request_id=request_id,
        detail={"from": previous, "to": model},
    )
    local = await container.router.local_health(force=True)
    return {"local": local.model_dump(mode="json")}
