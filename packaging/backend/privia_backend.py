"""Entry point frozen by PyInstaller into the desktop app's backend sidecar.

PyInstaller needs a script, not a package with relative imports, so this file
only forwards to the real entry point.
"""

import sys

from privia_api.__main__ import main

if __name__ == "__main__":
    sys.exit(main())
