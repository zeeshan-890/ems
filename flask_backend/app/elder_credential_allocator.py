"""Elder login username + temporary password allocation (caregiver patient enrollment).

Keeps logic import-light so tests do not need the full API / ML stack.
"""

from __future__ import annotations

import re
import secrets
import string
from typing import Any

# Bumped when rules change; exposed on GET /api/v1/health.
ELDER_CREDENTIAL_RULES_VERSION = "20260203-name-slug-username"


class ElderUsernameAllocationFailed(Exception):
    """Raised when no free username exists after slug, numeric suffixes, and random attempts."""


def _simple_letters_digits(*, letters: int = 5, digits: int = 5) -> str:
    """Human-friendly token: lowercase letters then digits (e.g. ``abcde12345``)."""
    alpha = "".join(secrets.choice(string.ascii_lowercase) for _ in range(letters))
    nums = "".join(secrets.choice(string.digits) for _ in range(digits))
    return f"{alpha}{nums}"


def elder_name_slug(full_name: str) -> str:
    """First word of display name -> lowercase [a-z0-9] only; used as username base and password prefix."""
    raw = (full_name or "").strip().lower()
    if not raw:
        return "patient"
    parts = [p for p in re.split(r"[\s._-]+", raw) if p]
    slug = ""
    for part in parts:
        slug = re.sub(r"[^a-z0-9]", "", part)
        if slug:
            break
    if not slug:
        slug = re.sub(r"[^a-z0-9]", "", raw)[:32]
    if not slug:
        slug = "patient"
    return slug[:32]


def _elder_username_taken(c: Any, username: str) -> bool:
    c.execute("SELECT 1 FROM users WHERE username = ?", (username,))
    return c.fetchone() is not None


def pick_unique_elder_username_for_patient(c: Any, full_name: str) -> str:
    """Prefer ``slug``, then ``slug_2`` … ``slug_9999``; only then random ``_simple_letters_digits()``."""
    base = elder_name_slug(full_name)
    candidates = [base, *(f"{base}_{i}" for i in range(2, 10_000))]
    for candidate in candidates:
        if not _elder_username_taken(c, candidate):
            return candidate
    for _ in range(64):
        candidate = _simple_letters_digits()
        if not _elder_username_taken(c, candidate):
            return candidate
    raise ElderUsernameAllocationFailed("Could not allocate a unique elder username; retry.")


def temporary_password_for_patient(name_slug: str) -> str:
    """Temp password: name slug + underscore + short random tail (never name-only)."""
    tail_letters = "".join(secrets.choice(string.ascii_lowercase) for _ in range(3))
    tail_digits = "".join(secrets.choice(string.digits) for _ in range(3))
    return f"{name_slug}_{tail_letters}{tail_digits}"
