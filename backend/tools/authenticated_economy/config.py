"""Generate private localhost-only credentials and pinned container configuration."""

import base64
import hashlib
import hmac
import json
import secrets
import time
from pathlib import Path
from urllib.parse import urlsplit

IMAGES = {
    "db": (
        "postgres:17-alpine@sha256:526f86d93c6ea08fd3f1fe5605650cacc781b2c6013169a0ad8f42c7d3d84f32"
    ),
    "auth": (
        "supabase/gotrue:v2.197.0@"
        "sha256:1736a63078f5922b198c4cbe50f80ab9a2d3b54fe8b7b6cfb2e9dc5dbbc12c6b"
    ),
    "rest": (
        "postgrest/postgrest:v14.18@"
        "sha256:c7cd7e265a85b05248abf53f4473fcec7e327c282d0bd0cf60f1551996d09fcf"
    ),
    "realtime": (
        "supabase/realtime:v2.148.3@"
        "sha256:25cf375b9b7cb71d90cdf6e04a1a30996e39a8df866ebd0525bba1d959edc8d6"
    ),
    "gateway": (
        "caddy:2.10.2@"
        "sha256:c3d7ee5d2b11f9dc54f947f68a734c84e9c9666c92c88a7f30b9cba5da182adb"
    ),
}
PORTS = {
    "gateway": 54421,
    "db": 54422,
    "auth": 54423,
    "rest": 54424,
    "realtime": 54425,
    "api": 58005,
    "frontend": 55105,
}


def validate(runtime: dict) -> dict:
    """Refuse edited configuration before any provider or database connection."""
    expected = {
        "providerUrl": ("https", "localhost", 54421),
        "apiUrl": ("http", "127.0.0.1", 58005),
        "frontendUrl": ("http", "127.0.0.1", 55105),
    }
    if runtime.get("project") != "mp505" or runtime.get("ports") != PORTS:
        raise ValueError("Only the isolated mp505 project and fixed loopback ports are allowed")
    for field, address in expected.items():
        parsed = urlsplit(runtime[field])
        if (
            (parsed.scheme, parsed.hostname, parsed.port) != address
            or parsed.username is not None
            or parsed.password is not None
            or parsed.path not in ("", "/")
            or parsed.query
            or parsed.fragment
        ):
            raise ValueError("Only the generated local provider endpoints are allowed")
    return runtime


def load(path: Path) -> dict:
    return validate(json.loads(path.read_text()))


def jwt(secret: str, role: str) -> str:
    """Sign only ephemeral local gateway keys, never user access tokens."""

    def part(value: dict) -> str:
        raw = json.dumps(value, separators=(",", ":")).encode()
        return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()

    payload = {
        "iss": "supabase",
        "role": role,
        "iat": int(time.time()),
        "exp": int(time.time()) + 86400,
    }
    message = part({"alg": "HS256", "typ": "JWT"}) + "." + part(payload)
    signature = hmac.new(secret.encode(), message.encode(), hashlib.sha256).digest()
    return message + "." + base64.urlsafe_b64encode(signature).rstrip(b"=").decode()


def private_json(path: Path, value: dict) -> None:
    path.write_text(json.dumps(value, indent=2) + "\n")
    path.chmod(0o600)


def create(directory: Path) -> dict:
    directory.mkdir(mode=0o700, parents=True, exist_ok=True)
    directory.chmod(0o700)
    location = directory / "runtime.json"
    if location.exists():
        return load(location)
    secret, password = secrets.token_urlsafe(48), secrets.token_urlsafe(32)
    runtime = {
        "directory": str(directory),
        "ports": PORTS,
        "images": IMAGES,
        "project": "mp505",
        "providerUrl": "https://localhost:54421",
        "caFile": str(directory / "provider-ca.crt"),
        "apiUrl": "http://127.0.0.1:58005",
        "frontendUrl": "http://127.0.0.1:55105",
        "jwtSecret": secret,
        "databasePassword": password,
        "anonKey": jwt(secret, "anon"),
        "serviceKey": jwt(secret, "service_role"),
        "realtimeSecret": secrets.token_hex(64),
        "realtimeDatabaseKey": secrets.token_hex(8),
    }
    private_json(location, runtime)
    private_json(directory / "compose.json", compose(runtime))
    (directory / "Caddyfile").write_text(gateway())
    return runtime


def compose(runtime: dict) -> dict:
    password = runtime["databasePassword"]

    def uri(role: str) -> str:
        return f"postgres://{role}:{password}@db:5432/postgres"

    common = {"restart": "no"}
    services = {
        "db": {
            "environment": {"POSTGRES_PASSWORD": password, "POSTGRES_DB": "postgres"},
            "ports": ["127.0.0.1:54422:5432"],
            "volumes": ["database:/var/lib/postgresql/data"],
            "command": [
                "postgres",
                "-c",
                "wal_level=logical",
                "-c",
                "max_replication_slots=10",
                "-c",
                "max_wal_senders=10",
            ],
        },
        "auth": {
            "environment": {
                "GOTRUE_API_HOST": "0.0.0.0",
                "GOTRUE_API_PORT": "9999",
                "API_EXTERNAL_URL": runtime["providerUrl"] + "/auth/v1",
                "GOTRUE_DB_DRIVER": "postgres",
                "GOTRUE_DB_DATABASE_URL": uri("supabase_auth_admin"),
                "GOTRUE_SITE_URL": runtime["frontendUrl"],
                "GOTRUE_URI_ALLOW_LIST": runtime["frontendUrl"] + "/**",
                "GOTRUE_JWT_SECRET": runtime["jwtSecret"],
                "GOTRUE_JWT_EXP": "3600",
                "GOTRUE_JWT_AUD": "authenticated",
                "GOTRUE_JWT_ADMIN_ROLES": "service_role",
                "GOTRUE_JWT_DEFAULT_GROUP_NAME": "authenticated",
                "GOTRUE_DISABLE_SIGNUP": "false",
                "GOTRUE_EXTERNAL_EMAIL_ENABLED": "true",
                "GOTRUE_MAILER_AUTOCONFIRM": "true",
                "GOTRUE_EXTERNAL_ANONYMOUS_USERS_ENABLED": "false",
            },
            "ports": ["127.0.0.1:54423:9999"],
        },
        "rest": {
            "environment": {
                "PGRST_DB_URI": uri("authenticator"),
                "PGRST_DB_SCHEMAS": "public",
                "PGRST_DB_ANON_ROLE": "anon",
                "PGRST_JWT_SECRET": runtime["jwtSecret"],
                "PGRST_DB_USE_LEGACY_GUCS": "false",
            },
            "ports": ["127.0.0.1:54424:3000"],
        },
        "realtime": {
            "hostname": "realtime-dev.supabase-realtime",
            "environment": {
                "PORT": "4000",
                "DB_HOST": "db",
                "DB_PORT": "5432",
                "DB_USER": "supabase_admin",
                "DB_PASSWORD": password,
                "DB_NAME": "postgres",
                "DB_AFTER_CONNECT_QUERY": "SET search_path TO _realtime",
                "DB_ENC_KEY": runtime["realtimeDatabaseKey"],
                "API_JWT_SECRET": runtime["jwtSecret"],
                "SECRET_KEY_BASE": runtime["realtimeSecret"],
                "METRICS_JWT_SECRET": runtime["jwtSecret"],
                "ERL_AFLAGS": "+S 2:2 -proto_dist inet_tcp",
                "APP_NAME": "realtime",
                "SEED_SELF_HOST": "true",
                "RUN_JANITOR": "true",
                "RLIMIT_NOFILE": "10000",
                "CLUSTER_STRATEGIES": "",
                "DISABLE_HEALTHCHECK_LOGGING": "true",
            },
            "ports": ["127.0.0.1:54425:4000"],
        },
        "gateway": {
            "ports": ["127.0.0.1:54421:8000"],
            "volumes": [str(Path(runtime["directory"]) / "Caddyfile") + ":/etc/caddy/Caddyfile:ro"],
        },
    }
    for name, settings in services.items():
        settings.update(common)
        settings["image"] = IMAGES[name]
        settings.setdefault("environment", {}).update(
            {
                "HTTP_PROXY": "",
                "HTTPS_PROXY": "",
                "ALL_PROXY": "",
                "http_proxy": "",
                "https_proxy": "",
                "all_proxy": "",
                "NO_PROXY": "db,auth,rest,realtime,localhost,127.0.0.1",
                "no_proxy": "db,auth,rest,realtime,localhost,127.0.0.1",
            }
        )
    return {"services": services, "volumes": {"database": {}}}


def gateway() -> str:
    allowed_headers = (
        "Authorization,apikey,content-type,x-client-info,"
        "x-supabase-api-version,x-island-economy-version"
    )
    return """https://localhost:8000 {
    tls internal
    header {
        >Access-Control-Allow-Origin http://127.0.0.1:55105
        >Access-Control-Allow-Headers ALLOWED_HEADERS
        >Access-Control-Allow-Methods GET,POST,PUT,DELETE,PATCH,OPTIONS
        >Access-Control-Max-Age 600
        >Vary Origin
    }
    @preflight method OPTIONS
    respond @preflight 204
    handle_path /auth/v1/* {
        reverse_proxy auth:9999
    }
    handle_path /rest/v1/* {
        reverse_proxy rest:3000
    }
    handle_path /realtime/v1/* {
        rewrite * /socket{path}
        reverse_proxy realtime:4000 {
            header_up Host realtime-dev.supabase-realtime
        }
    }
    respond /health 200
}
""".replace("ALLOWED_HEADERS", allowed_headers)
