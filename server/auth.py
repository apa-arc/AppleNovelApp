import hashlib
import hmac
import secrets
import sqlite3
from pathlib import Path


def hash_device_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def issue_device_token(enrollment_code: str, configured_code: str, database_path: str) -> str:
    if not configured_code:
        raise RuntimeError("Device enrollment is not configured.")
    if not hmac.compare_digest(enrollment_code, configured_code):
        raise PermissionError("Invalid enrollment code.")
    token = secrets.token_urlsafe(32)
    digest = hash_device_token(token)
    Path(database_path).parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(database_path) as database:
        database.execute(
            "CREATE TABLE IF NOT EXISTS device_tokens (token_hash TEXT PRIMARY KEY, created_at TEXT DEFAULT CURRENT_TIMESTAMP)"
        )
        database.execute("INSERT INTO device_tokens (token_hash) VALUES (?)", (digest,))
    return token


def is_device_token_valid(token: str, database_path: str) -> bool:
    if not token:
        return False
    digest = hash_device_token(token)
    with sqlite3.connect(database_path) as database:
        database.execute(
            "CREATE TABLE IF NOT EXISTS device_tokens (token_hash TEXT PRIMARY KEY, created_at TEXT DEFAULT CURRENT_TIMESTAMP)"
        )
        row = database.execute(
            "SELECT 1 FROM device_tokens WHERE token_hash = ? LIMIT 1", (digest,)
        ).fetchone()
    return row is not None


def revoke_device_token(token: str, database_path: str) -> bool:
    if not token:
        return False
    digest = hash_device_token(token)
    with sqlite3.connect(database_path) as database:
        cursor = database.execute("DELETE FROM device_tokens WHERE token_hash = ?", (digest,))
        return cursor.rowcount > 0
