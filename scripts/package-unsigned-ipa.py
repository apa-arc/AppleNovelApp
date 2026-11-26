#!/usr/bin/env python3
"""Create a SideStore-compatible unsigned IPA with conservative ZIP metadata."""

import os
import stat
import sys
import zipfile
from pathlib import Path

STAMP = (2026, 1, 1, 0, 0, 0)


def zip_info(name: str, mode: int, is_dir: bool = False) -> zipfile.ZipInfo:
    info = zipfile.ZipInfo(name, STAMP)
    info.create_system = 3
    info.create_version = 20
    info.extract_version = 20
    info.extra = b""
    info.comment = b""
    info.external_attr = (mode & 0xFFFF) << 16
    if is_dir:
        info.external_attr |= 0x10
        info.compress_type = zipfile.ZIP_STORED
    else:
        info.compress_type = zipfile.ZIP_DEFLATED
    return info


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit("usage: package-unsigned-ipa.py <directory-containing-Payload> <output.ipa>")

    root = Path(sys.argv[1]).resolve()
    payload = root / "Payload"
    output = Path(sys.argv[2]).resolve()
    if not payload.is_dir():
        raise SystemExit(f"Payload directory not found: {payload}")

    output.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6, allowZip64=True) as archive:
        archive.writestr(zip_info("Payload/", stat.S_IFDIR | 0o755, True), b"")
        paths = sorted(payload.rglob("*"), key=lambda p: (len(p.parts), p.as_posix()))
        for path in paths:
            relative = path.relative_to(root).as_posix()
            file_stat = path.lstat()
            mode = file_stat.st_mode

            if stat.S_ISDIR(mode):
                archive.writestr(zip_info(relative.rstrip("/") + "/", mode, True), b"")
            elif stat.S_ISLNK(mode):
                target = os.readlink(path).encode("utf-8")
                archive.writestr(zip_info(relative, mode), target)
            elif stat.S_ISREG(mode):
                with path.open("rb") as source:
                    archive.writestr(zip_info(relative, mode), source.read())
            else:
                raise SystemExit(f"Unsupported file type in app bundle: {path}")

    with zipfile.ZipFile(output, "r") as archive:
        entries = archive.infolist()
        if not entries or entries[0].filename != "Payload/":
            raise SystemExit("IPA is missing the Payload/ root directory entry")
        extras = [entry.filename for entry in entries if entry.extra]
        if extras:
            raise SystemExit(f"ZIP extra fields found: {extras[:5]}")
        versions = [entry.filename for entry in entries if entry.create_version != 20 or entry.extract_version != 20]
        if versions:
            raise SystemExit(f"Unexpected ZIP version metadata: {versions[:5]}")
        bad = archive.testzip()
        if bad:
            raise SystemExit(f"IPA CRC validation failed at: {bad}")
        apps = [entry.filename for entry in entries if entry.filename.startswith("Payload/") and entry.filename.endswith(".app/Info.plist")]
        if len(apps) != 1:
            raise SystemExit(f"Expected exactly one app Info.plist, found: {apps}")
        executable_files = [
            entry.filename
            for entry in entries
            if stat.S_ISREG((entry.external_attr >> 16) & 0xFFFF)
            and ((entry.external_attr >> 16) & 0o111)
        ]
        if not executable_files:
            raise SystemExit("No regular executable files with executable permissions were preserved")

    print(f"SideStore-compatible IPA verified: {output.stat().st_size} bytes")
    print(f"Entries: {len(entries)} | ZIP metadata: 2.0 | Extra fields: none | CRC: OK")
    print(f"App plist: {apps[0]} | Executable files: {len(executable_files)}")


if __name__ == "__main__":
    main()
