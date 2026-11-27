#!/usr/bin/env python3
"""Package and validate an unsigned iOS IPA using Apple's native ditto archiver."""

import os
import posixpath
import plistlib
import stat
import subprocess
import sys
import zipfile
from pathlib import Path


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit("usage: package-unsigned-ipa.py <directory-containing-Payload> <output.ipa>")

    root = Path(sys.argv[1]).resolve()
    payload = root / "Payload"
    output = Path(sys.argv[2]).resolve()
    if not payload.is_dir():
        raise SystemExit(f"Payload directory not found: {payload}")
    if not (payload.is_dir() and list(payload.glob("*.app"))):
        raise SystemExit("Payload must contain an iOS .app bundle at its root")

    output.parent.mkdir(parents=True, exist_ok=True)
    if output.exists():
        output.unlink()

    # ditto is Apple's bundle-aware archiver. Unlike a pathlib/rglob ZIP writer,
    # it preserves macOS file metadata and traverses framework bundle structures
    # without flattening or silently skipping directory symlinks.
    subprocess.run(
        [
            "/usr/bin/ditto",
            "-c",
            "-k",
            "--sequesterRsrc",
            "--keepParent",
            "Payload",
            str(output),
        ],
        cwd=root,
        check=True,
    )

    with zipfile.ZipFile(output, "r") as archive:
        entries = archive.infolist()
        names = {entry.filename.rstrip("/") for entry in entries}
        if not entries or not any(name.startswith("Payload/") for name in names):
            raise SystemExit("IPA is missing the Payload/ root")
        if any(not (entry.filename == "Payload/" or entry.filename.startswith("Payload/")) for entry in entries):
            raise SystemExit("Unexpected files found outside the Payload/ root")

        bad = archive.testzip()
        if bad:
            raise SystemExit(f"IPA CRC validation failed at: {bad}")

        app_plists = [
            entry.filename
            for entry in entries
            if entry.filename.startswith("Payload/")
            and entry.filename.endswith(".app/Info.plist")
        ]
        if len(app_plists) != 1:
            raise SystemExit(f"Expected exactly one top-level app Info.plist, found: {app_plists}")

        app_plist_path = app_plists[0]
        app_root = app_plist_path.rsplit("/Info.plist", 1)[0]
        app_info = plistlib.loads(archive.read(app_plist_path))
        executable_name = app_info.get("CFBundleExecutable")
        if not executable_name:
            raise SystemExit("App Info.plist has no CFBundleExecutable")
        executable_path = f"{app_root}/{executable_name}"
        if executable_path not in names:
            raise SystemExit(f"App executable is missing from IPA: {executable_path}")

        executable_info = next(entry for entry in entries if entry.filename.rstrip("/") == executable_path)
        executable_mode = (executable_info.external_attr >> 16) & 0xFFFF
        if not (executable_mode & 0o111):
            raise SystemExit(f"App executable lost executable permissions: {executable_path}")
        if not archive.read(executable_info):
            raise SystemExit("App executable is unexpectedly empty")

        symlinks = []
        executable_files = []
        for entry in entries:
            mode = (entry.external_attr >> 16) & 0xFFFF
            if stat.S_ISLNK(mode):
                target = archive.read(entry).decode("utf-8", errors="strict")
                if not target:
                    raise SystemExit(f"Empty symlink target: {entry.filename}")
                resolved = posixpath.normpath(posixpath.join(posixpath.dirname(entry.filename), target))
                if resolved.startswith("../") or resolved == "..":
                    raise SystemExit(f"Symlink escapes the app bundle: {entry.filename} -> {target}")
                if resolved not in names and not any(name.startswith(resolved.rstrip("/") + "/") for name in names):
                    raise SystemExit(f"Broken symlink in IPA: {entry.filename} -> {target}")
                symlinks.append(entry.filename)
            elif stat.S_ISREG(mode) and mode & 0o111:
                executable_files.append(entry.filename)

        if not executable_files:
            raise SystemExit("No executable files with preserved Unix permissions were found")
        if not archive.read(app_plist_path):
            raise SystemExit("App Info.plist is unexpectedly empty")

    print(f"IPA packaged with /usr/bin/ditto: {output.stat().st_size} bytes")
    print(f"ZIP CRC: OK | Entries: {len(entries)} | App: {app_root}")
    print(f"Executable files: {len(executable_files)} | Symlinks preserved and checked: {len(symlinks)}")
    print(f"App executable: {executable_path}")


if __name__ == "__main__":
    main()
