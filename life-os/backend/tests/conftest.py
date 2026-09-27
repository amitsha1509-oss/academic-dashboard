import os
import sys
import tempfile
from pathlib import Path

import pytest

# Point the app at a throwaway data folder before it is imported.
os.environ["LIFEOS_DATA_DIR"] = tempfile.mkdtemp(prefix="lifeos-test-")
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


@pytest.fixture(scope="session")
def client():
    from fastapi.testclient import TestClient
    from app.main import app
    return TestClient(app)
