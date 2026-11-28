#!/usr/bin/env python3
"""Create a SideStore-friendly, standards-compliant unsigned iOS IPA."""

import os
import posixpath
import plistlib
import stat
import sys
import zipfile
from pathlib import Path


def zip_info(path: str, mode: int, is_dir: bool = False) -> zipfile.ZipInfo:
    info = zipfile.ZipInfo(path + ("/" if is_dir and not path.endswith("/") else ""))
    info.create_system = 3  # Unix: preserve executable bits and symlinks.
    info.external_attr = (mode & 0xFFFF) << 16
    if is_dir:
        info.external_attr |= 0x10
        info.compress_type = zipfile.ZIP_STORED
    else:
        info.compress_type = zipfile.ZIP_DEFLATED
    info.flag_bits = 0
    info.extra = b""
    info.comment = b""
    return info


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit("usage: package-unsigned-ipa.py <directory-containing-Payload> <output.ipa>")

    root = Path(sys.argv[1]).resolve()
    payload = root / "Payload"
    output = Path(sys.argv[2]).resolve()
    apps = sorted(payload.glob("*.app")) if payload.is_dir() else []
    if len(apps) != 1 or not apps[0].is_dir():
        raise SystemExit("Payload must contain exactly one top-level iOS .app bundle")

    output.parent.mkdir(parents=True, exist_ok=True)
    output.unlink(missing_ok=True)

    # Build a plain ZIP/IPA directly. Apple's ditto adds macOS-specific ZIP
    # timestamp/metadata fields and data descriptors that some sideloading
    # archive readers reject. Keep only standard ZIP records and Unix modes.
    with zipfile.ZipFile(output, "w", allowZip64=False, compression=zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
        paths = [payload] + sorted(payload.rglob("*"), key=lambda p: p.as_posix())
        for path in paths:
            relative = path.relative_to(root).as_posix()
            st = path.lstat()
            mode = st.st_mode
            if stat.S_ISLNK(mode):
                target = os.readlink(path)
                info = zip_info(relative, stat.S_IFLNK | stat.S_IMODE(mode))
                archive.writestr(info, target.encode("utf-8"), compress_type=zipfile.ZIP_STORED)
            elif stat.S_ISDIR(mode):
                info = zip_info(relative, stat.S_IFDIR | stat.S_IMODE(mode), is_dir=True)
                archive.writestr(info, b"")
            elif stat.S_ISREG(mode):
                info = zip_info(relative, stat.S_IFREG | stat.S_IMODE(mode))
                archive.writestr(info, path.read_bytes(), compress_type=zipfile.ZIP_DEFLATED, compresslevel=6)
            else:
                raise SystemExit(f"Unsupported filesystem object in app bundle: {relative}")

    with zipfile.ZipFile(output, "r") as archive:
        entries = archive.infolist()
        names = {entry.filename.rstrip("/") for entry in entries}
        if not entries or "Payload" not in names or not any(name.startswith("Payload/") for name in names):
            raise SystemExit("IPA is missing the Payload/ root")
        if any(not (entry.filename == "Payload/" or entry.filename.startswith("Payload/")) for entry in entries):
            raise SystemExit("Unexpected files found outside the Payload/ root")
        bad = archive.testzip()
        if bad:
            raise SystemExit(f"IPA CRC validation failed at: {bad}")
        if any(entry.extra or entry.flag_bits & 0x08 for entry in entries):
            raise SystemExit("Non-standard ZIP extra fields/data descriptors detected")
        if any(entry.create_system != 3 for entry in entries):
            raise SystemExit("ZIP entries must use Unix attributes")

        app_plists = [
            entry.filename for entry in entries
            if entry.filename.startswith("Payload/") and entry.filename.endswith(".app/Info.plist")
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
        executable_info = next(e for e in entries if e.filename.rstrip("/") == executable_path)
        executable_mode = (executable_info.external_attr >> 16) & 0xFFFF
        if not stat.S_ISREG(executable_mode) or not (executable_mode & 0o111):
            raise SystemExit(f"App executable lost executable permissions: {executable_path}")
        if not archive.read(executable_info):
            raise SystemExit("App executable is unexpectedly empty")

        symlinks = 0
        for entry in entries:
            mode = (entry.external_attr >> 16) & 0xFFFF
            if stat.S_ISLNK(mode):
                target = archive.read(entry).decode("utf-8", errors="strict")
                if not target:
                    raise SystemExit(f"Empty symlink target: {entry.filename}")
                resolved = posixpath.normpath(posixpath.join(posixpath.dirname(entry.filename), target))
                if resolved.startswith("../") or resolved == "..":
                    raise SystemExit(f"Symlink escapes Payload: {entry.filename} -> {target}")
                if resolved not in names and not any(n.startswith(resolved.rstrip("/") + "/") for n in names):
                    raise SystemExit(f"Broken symlink in IPA: {entry.filename} -> {target}")
                symlinks += 1

    print(f"SideStore-friendly IPA created: {output.stat().st_size} bytes")
    print(f"Standard ZIP records: OK | CRC: OK | Entries: {len(entries)}")
    print(f"App: {app_root} | Executable: {executable_path} | Symlinks: {symlinks}")
    print("No macOS ZIP extra fields or data descriptors.")


if __name__ == "__main__":
    main()
