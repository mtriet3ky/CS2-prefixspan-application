"""Cross-platform command-line entry point."""
import argparse
from . import __version__

def main():
    parser = argparse.ArgumentParser(description='CS2 Tactical Replay and PrefixSpan analysis')
    parser.add_argument('--port', type=int, default=8767, help='Local HTTP port (default: 8767)')
    parser.add_argument('--prepare-data', action='store_true', help='Check data/cache metadata and exit')
    parser.add_argument('--version', action='version', version=__version__)
    args = parser.parse_args()
    if not 1 <= args.port <= 65535:
        parser.error('--port must be between 1 and 65535')
    from .data import prepare
    prepare()
    if args.prepare_data:
        print('Runtime data is ready.')
        return
    from .serve import main as serve
    try:
        serve(port=args.port)
    except KeyboardInterrupt:
        print('\nServer stopped.')
