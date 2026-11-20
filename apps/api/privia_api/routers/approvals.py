"""Actions waiting for the user's approval.

Listing a pending approval does not approve it. Approval still happens only by
answering it in its own conversation, where the backend checks that the
session, tool and exact arguments match what was previewed.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Query

from ..deps import ContainerDep

router = APIRouter(prefix="/api/v1/approvals", tags=["approvals"])


@router.get("", summary="Actions waiting for your approval")
async def pending_approvals(
    container: ContainerDep, limit: int = Query(default=20, ge=1, le=100)
) -> dict[str, Any]:
    rows = container.repositories.confirmations.pending(limit=limit)
    approvals = []
    for row in rows:
        payload = row.get("payload") or {}
        approvals.append(
            {
                "id": row["id"],
                "session_id": row["session_id"],
                "tool_name": row["tool_name"],
                "title": payload.get("title") or row["tool_name"],
                "summary": payload.get("summary", ""),
                "risk_level": payload.get("risk_level", "medium"),
                "created_at": row["created_at"],
                "expires_at": row["expires_at"],
                "confirmation": payload,
            }
        )
    return {"count": len(approvals), "approvals": approvals}
