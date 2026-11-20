"""Interface preferences: onboarding state, start screen, layout.

These are stored in the local database next to the other user settings. Only
the keys below are accepted, each with a fixed type, so this endpoint cannot be
used to overwrite security-relevant settings such as allowed folders.
"""

from __future__ import annotations

from typing import Any, Literal

from fastapi import APIRouter
from pydantic import BaseModel, ConfigDict

from ..deps import ContainerDep

router = APIRouter(prefix="/api/v1/preferences", tags=["preferences"])

PREFIX = "pref."


class Preferences(BaseModel):
    model_config = ConfigDict(extra="forbid")

    onboarding_completed: bool = False
    start_screen: Literal["home", "workspace"] = "home"
    sidebar_collapsed: bool = False
    reduce_motion: bool = False


class PreferencesPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    onboarding_completed: bool | None = None
    start_screen: Literal["home", "workspace"] | None = None
    sidebar_collapsed: bool | None = None
    reduce_motion: bool | None = None


def _load(container: ContainerDep) -> Preferences:
    stored = container.repositories.settings.all()
    values: dict[str, Any] = {
        key[len(PREFIX) :]: value for key, value in stored.items() if key.startswith(PREFIX)
    }
    known = {k: v for k, v in values.items() if k in Preferences.model_fields}
    try:
        return Preferences.model_validate(known)
    except ValueError:
        # A hand-edited database must not lock the user out of the interface.
        return Preferences()


@router.get("", response_model=Preferences, summary="Interface preferences")
async def get_preferences(container: ContainerDep) -> Preferences:
    return _load(container)


@router.put("", response_model=Preferences, summary="Change interface preferences")
async def update_preferences(body: PreferencesPatch, container: ContainerDep) -> Preferences:
    for key, value in body.model_dump(exclude_none=True).items():
        if isinstance(value, str):
            value = value.strip()
        container.repositories.settings.set(f"{PREFIX}{key}", value)
    return _load(container)
