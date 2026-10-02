"""Fetch raw source files into data/raw/ and record them in MANIFEST.json: python -m pipeline.download"""
import hashlib
import json
import shutil
import sys
import urllib.request
from datetime import date
from pathlib import Path

from pipeline.config import DOWNLOADS, MANIFEST, RAW

# gov.au sites can reject Python's default User-Agent.
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36"


def sha256(path: Path) -> str:
    """Hex sha256 of a file, read in 1 MB chunks."""
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def fetch(url: str, dest: Path) -> None:
    """Stream url to dest via a .part file, so a failed download never looks complete."""
    part = dest.with_name(dest.name + ".part")
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=120) as r, part.open("wb") as f:
        shutil.copyfileobj(r, f, 1 << 20)
    part.rename(dest)


def main() -> None:
    """Download any missing file, then rewrite the manifest for every file present."""
    RAW.mkdir(parents=True, exist_ok=True)
    manifest = json.loads(MANIFEST.read_text()) if MANIFEST.exists() else {}
    failed = []
    for name, url in DOWNLOADS.items():
        dest = RAW / name
        if not dest.exists():
            print(f"fetching {name}")
            try:
                fetch(url, dest)
            except Exception as e:
                failed.append((name, url, repr(e)))
                continue
            manifest[name] = {"url": url, "download_date": date.today().isoformat()}
        # Files saved by hand get their modified date.
        entry = manifest.setdefault(name, {"url": url, "download_date": date.fromtimestamp(dest.stat().st_mtime).isoformat()})
        entry.update(sha256=sha256(dest), bytes=dest.stat().st_size)
    MANIFEST.write_text(json.dumps(manifest, indent=2) + "\n")

    for name, e in manifest.items():
        print(f"{e['bytes'] / 1e6:9.2f} MB  {name}")
    print(f"{sum(e['bytes'] for e in manifest.values()) / 1e6:9.2f} MB  total, manifest -> {MANIFEST}")
    for name, url, err in failed:
        print(f"FAILED {name}\n  url: {url}\n  error: {err}", file=sys.stderr)
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
