"""Set up and run the local demo from a Git checkout."""

import argparse
import hashlib
from pathlib import Path
import shutil
import subprocess
import sys
import venv


ROOT = Path(__file__).resolve().parent
ENV = ROOT / ".venv"


def checked(command, failure, *, capture=False):
    try:
        return subprocess.run(
            command, cwd=ROOT, check=True, text=True,
            stdout=subprocess.PIPE if capture else None,
        ).stdout
    except subprocess.CalledProcessError as exc:
        raise SystemExit(failure) from exc


def download_data():
    if not shutil.which("git"):
        raise SystemExit("Install Git, then run this command again.")
    checked(
        ["git", "lfs", "version"],
        "Install Git LFS and try again. On Ubuntu/Debian: sudo apt install git-lfs",
        capture=True,
    )
    def missing_files():
        listing = checked(
            ["git", "lfs", "ls-files"],
            "Open the Git clone of the project and run this command there.",
            capture=True,
        )
        files = [line.split(" ", 2)[1:] for line in listing.splitlines()]
        if not files:
            raise SystemExit("No Git LFS data found. Clone the project with Git before running the demo.")
        return [name for status, name in files if status == "-" or not (ROOT / name).is_file()]

    if missing_files():
        print("Downloading demo data with Git LFS. The full checkout needs about 4.7 GiB.", flush=True)
        checked(
            ["git", "lfs", "pull", "--include=", "--exclude="],
            "Git LFS could not download the data. Check the Git error above, then rerun this command.",
        )
        remaining = missing_files()
        if remaining:
            raise SystemExit(f"{len(remaining)} Git LFS files are still missing, including {remaining[0]}.")


def prepare_python():
    interpreter = ENV / ("Scripts/python.exe" if sys.platform == "win32" else "bin/python")
    if not interpreter.is_file():
        print("Creating .venv for the demo.", flush=True)
        try:
            venv.EnvBuilder(with_pip=True).create(ENV)
        except (OSError, subprocess.CalledProcessError) as exc:
            print(exc, file=sys.stderr)
            raise SystemExit(
                "Could not create .venv. On Ubuntu/Debian, install python3-venv "
                "(or the venv package for your Python version), then rerun."
            ) from exc
    stamp = ENV / "cs2-demo-dependencies"
    config_hash = hashlib.sha256((ROOT / "pyproject.toml").read_bytes()).hexdigest()
    if not stamp.is_file() or stamp.read_text(encoding="ascii") != config_hash:
        print("Installing the demo's Python dependencies.", flush=True)
        checked(
            [str(interpreter), "-m", "pip", "install", "-e", "."],
            "Python setup failed. Check the pip error above and rerun this command.",
        )
        stamp.write_text(config_hash, encoding="ascii")
    return interpreter


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8767)
    parser.add_argument("--prepare-data", action="store_true", help="Set up the demo and check its data without starting the server.")
    args = parser.parse_args()
    if not 1 <= args.port <= 65535:
        parser.error("--port must be between 1 and 65535")
    if sys.version_info < (3, 11):
        raise SystemExit("Run this command with Python 3.11 or newer.")
    download_data()
    interpreter = prepare_python()
    command = [str(interpreter), "-m", "cs2_tactical", "--port", str(args.port)]
    if args.prepare_data:
        command.append("--prepare-data")
    else:
        print(f"Round Replay: http://localhost:{args.port}/", flush=True)
        print(f"Tactical Analysis: http://localhost:{args.port}/tactical.html", flush=True)
    try:
        return subprocess.run(command, cwd=ROOT).returncode
    except KeyboardInterrupt:
        return 130


if __name__ == "__main__":
    sys.exit(main())
