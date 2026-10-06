import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, create_db_engine, get_db
from app.main import app

PASSWORD = "password123"


@pytest.fixture
def db_session():
    # A fresh in-memory database per test. StaticPool shares one connection so every
    # session sees the same in-memory data.
    engine = create_db_engine("sqlite://", poolclass=StaticPool)
    Base.metadata.create_all(engine)
    TestingSession = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    yield TestingSession
    engine.dispose()


@pytest.fixture
def anon_client(db_session):
    """A client with no Authorization header (e.g. a guest opening an invite link)."""

    def override_get_db():
        with db_session() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db
    # Not used as a context manager, so the lifespan (which touches the real DB) doesn't run.
    yield TestClient(app)
    app.dependency_overrides.clear()


def signed_in_client(name: str, email: str) -> TestClient:
    """Signs up a new account through the API and returns a client that sends its token."""
    client = TestClient(app)
    response = client.post("/api/auth/signup", json={"name": name, "email": email, "password": PASSWORD})
    assert response.status_code == 201, response.text
    client.headers["Authorization"] = f"Bearer {response.json()['token']}"
    return client


@pytest.fixture
def client(anon_client):
    """Signed in as "Test Host"."""
    return signed_in_client("Test Host", "host@example.com")


@pytest.fixture
def other_client(anon_client):
    """Signed in as a second, unrelated account."""
    return signed_in_client("Other User", "other@example.com")
