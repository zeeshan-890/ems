"""Elder username / temporary password allocation for caregiver patient enrollment."""

from __future__ import annotations

import re
import sqlite3

import pytest

import flask_backend.app.elder_credential_allocator as alloc
from flask_backend.app.elder_credential_allocator import (
    elder_name_slug,
    pick_unique_elder_username_for_patient,
    temporary_password_for_patient,
)


@pytest.mark.parametrize(
    "full_name,expected",
    [
        ("Khan", "khan"),
        ("khan ali", "khan"),
        ("Mary-Jane Watson", "mary"),
        ("", "patient"),
        ("   ", "patient"),
    ],
)
def test_elder_name_slug(full_name: str, expected: str) -> None:
    assert elder_name_slug(full_name) == expected


def test_temporary_password_shape() -> None:
    pw = temporary_password_for_patient("khan")
    assert re.fullmatch(r"khan_[a-z]{3}\d{3}", pw), pw


def test_username_prefers_slug_then_numeric_suffix() -> None:
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    c = conn.cursor()
    c.execute("CREATE TABLE users (username TEXT UNIQUE NOT NULL)")
    c.execute("INSERT INTO users (username) VALUES ('khan')")
    assert pick_unique_elder_username_for_patient(c, "Khan Z") == "khan_2"
    c.execute("INSERT INTO users (username) VALUES ('khan_2')")
    assert pick_unique_elder_username_for_patient(c, "Khan") == "khan_3"


def test_username_random_fallback_when_suffixes_exhausted(monkeypatch: pytest.MonkeyPatch) -> None:
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    c = conn.cursor()
    c.execute("CREATE TABLE users (username TEXT UNIQUE NOT NULL)")
    for i in range(1, 10_000):
        uname = "x" if i == 1 else f"x_{i}"
        c.execute("INSERT INTO users (username) VALUES (?)", (uname,))

    def fake_digits(*, letters: int = 5, digits: int = 5) -> str:
        return "zzzzz99999"

    monkeypatch.setattr(alloc, "_simple_letters_digits", fake_digits)
    out = pick_unique_elder_username_for_patient(c, "X")
    assert out == "zzzzz99999"
