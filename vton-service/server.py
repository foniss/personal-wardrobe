"""
Local virtual try-on HTTP service.

Deliberately built on the Python standard library only, so that:
  * it starts on any Python 3.9+ with zero pip installs,
  * /health can always answer "model not installed" instead of the
    Next.js app hanging or guessing,
  * the heavy CatVTON stack stays entirely optional.

Endpoints
    GET  /health   -> service + backend + model diagnostics
    POST /try-on   -> { person, garment, cloth_type, ... } -> { image }

Images are exchanged as base64 data (no files on disk, nothing leaves
localhost).

Run:
    python vton-service/server.py
    python vton-service/server.py --port 8188 --host 127.0.0.1
"""

from __future__ import annotations

import argparse
import base64
import io
import json
import os
import sys
import threading
import time
import traceback
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Make a CatVTON checkout importable if the user pointed us at one.
_CATVTON_PATH = os.environ.get("CATVTON_PATH", "").strip()
if _CATVTON_PATH and os.path.isdir(_CATVTON_PATH):
    sys.path.insert(0, _CATVTON_PATH)

from catvton_runner import (  # noqa: E402
    CONFIG,
    MODEL_VERSION,
    ModelUnavailable,
    RUNNER,
    probe_backend,
)

SERVICE_VERSION = "1.0.0"
MAX_BODY_BYTES = 32 * 1024 * 1024  # 32 MB of base64 payload
START_TIME = time.time()

# Serialize inference; a diffusion pass is not safely re-entrant.
_INFERENCE_LOCK = threading.Lock()

VALID_CLOTH_TYPES = ("upper", "lower", "overall")


def _decode_image(value, field: str):
    """Accept a raw base64 string or a data: URI and return a PIL image."""
    from PIL import Image  # imported lazily; Pillow is optional at boot

    if not isinstance(value, str) or not value:
        raise ValueError(f"'{field}' must be a base64 image string.")
    if value.startswith("data:"):
        try:
            value = value.split(",", 1)[1]
        except IndexError as exc:
            raise ValueError(f"'{field}' is not a valid data URI.") from exc
    try:
        raw = base64.b64decode(value, validate=False)
    except Exception as exc:
        raise ValueError(f"'{field}' is not valid base64.") from exc
    if not raw:
        raise ValueError(f"'{field}' is empty.")
    try:
        return Image.open(io.BytesIO(raw)).convert("RGB")
    except Exception as exc:
        raise ValueError(f"'{field}' is not a readable image.") from exc


def _encode_png(image) -> str:
    buf = io.BytesIO()
    image.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode("ascii")


def build_health() -> dict:
    backend = probe_backend()
    model = RUNNER.status()

    try:
        import PIL  # noqa: F401

        pillow = True
    except Exception:
        pillow = False

    # "ready" = we can actually serve a try-on request right now,
    # or could load the model on demand.
    can_load = bool(backend["selected_device"]) and pillow
    ready = model["loaded"] or can_load

    reasons = []
    if not pillow:
        reasons.append("Pillow is not installed (pip install -r requirements.txt).")
    if not backend["selected_device"]:
        reasons.append(backend["device_reason"])
    if model["load_error"]:
        reasons.append(model["load_error"])

    return {
        "service": "catvton-local",
        "service_version": SERVICE_VERSION,
        "status": "ready" if ready else "unavailable",
        "ready": ready,
        "uptime_seconds": round(time.time() - START_TIME, 1),
        "model": {
            "name": "CatVTON",
            "version": MODEL_VERSION,
            "available": can_load,
            "loaded": model["loaded"],
            "loading": model["loading"],
            "automasker": model["automasker"],
            "repo_id": model["repo_id"],
            "base_model": model["base_model"],
            "resolution": model["resolution"],
            "load_error": model["load_error"],
        },
        "backend": {
            "python": sys.version.split()[0],
            "pillow": pillow,
            "torch_installed": backend["torch_installed"],
            "torch_version": backend["torch_version"],
            "cuda_available": backend["cuda_available"],
            "cuda_version": backend["cuda_version"],
            "hip_version": backend["hip_version"],
            "mps_available": backend["mps_available"],
            "directml_available": backend["directml_available"],
            "devices": backend["devices"],
            "device": backend["selected_device"],
            "device_reason": backend["device_reason"],
            "allow_cpu": CONFIG.allow_cpu,
        },
        "capabilities": {
            # Milestone 1: one person + one garment per generation.
            "max_garments_per_request": 1,
            "cloth_types": list(VALID_CLOTH_TYPES),
            "accepts_mask": True,
            "auto_mask": model["automasker"],
        },
        "reasons": [r for r in reasons if r],
        "license": "CatVTON weights & code: CC BY-NC-SA 4.0 (non-commercial)",
    }


class Handler(BaseHTTPRequestHandler):
    server_version = f"catvton-local/{SERVICE_VERSION}"

    # ------------------------------------------------------------- plumbing

    def log_message(self, fmt, *args):  # noqa: A003
        # Never log payloads — they contain private user photos.
        sys.stderr.write(
            "[vton] %s - %s\n" % (self.address_string(), fmt % args)
        )

    def _send(self, code: int, payload: dict) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        # Local-only service; the Next.js server calls it from the same host.
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):  # noqa: N802
        self._send(204, {})

    # --------------------------------------------------------------- routes

    def do_GET(self):  # noqa: N802
        path = self.path.split("?", 1)[0].rstrip("/") or "/"
        if path in ("/health", "/"):
            try:
                self._send(200, build_health())
            except Exception as exc:
                self._send(
                    500,
                    {"status": "error", "error": f"health check failed: {exc}"},
                )
            return
        self._send(404, {"error": "not found"})

    def do_POST(self):  # noqa: N802
        path = self.path.split("?", 1)[0].rstrip("/") or "/"
        if path != "/try-on":
            self._send(404, {"error": "not found"})
            return

        try:
            length = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            self._send(400, {"success": False, "error": "invalid Content-Length"})
            return
        if length <= 0:
            self._send(400, {"success": False, "error": "empty request body"})
            return
        if length > MAX_BODY_BYTES:
            self._send(
                413,
                {"success": False, "error": "payload too large (limit 32 MB)"},
            )
            return

        try:
            body = json.loads(self.rfile.read(length).decode("utf-8"))
        except Exception:
            self._send(400, {"success": False, "error": "invalid JSON body"})
            return

        started = time.time()
        try:
            result = self._run_try_on(body)
        except ValueError as exc:
            self._send(400, {"success": False, "error": str(exc), "code": "invalid_input"})
            return
        except ModelUnavailable as exc:
            self._send(
                503,
                {
                    "success": False,
                    "error": str(exc),
                    "code": "model_unavailable",
                    "health": build_health(),
                },
            )
            return
        except Exception as exc:
            traceback.print_exc()
            self._send(
                500,
                {
                    "success": False,
                    "error": f"{exc.__class__.__name__}: {exc}",
                    "code": "inference_failed",
                },
            )
            return

        result["metadata"]["duration_seconds"] = round(time.time() - started, 2)
        self._send(200, result)

    # ------------------------------------------------------------ inference

    def _run_try_on(self, body: dict) -> dict:
        person_raw = body.get("person") or body.get("person_image")
        garment_raw = body.get("garment") or body.get("garment_image")
        if not person_raw:
            raise ValueError("'person' image is required.")
        if not garment_raw:
            raise ValueError("'garment' image is required.")

        cloth_type = str(body.get("cloth_type") or "upper").lower()
        if cloth_type not in VALID_CLOTH_TYPES:
            raise ValueError(
                f"'cloth_type' must be one of {', '.join(VALID_CLOTH_TYPES)}."
            )

        try:
            from PIL import Image  # noqa: F401
        except Exception as exc:
            raise ModelUnavailable(
                "Pillow is not installed. Run: pip install -r "
                "vton-service/requirements.txt"
            ) from exc

        person = _decode_image(person_raw, "person")
        garment = _decode_image(garment_raw, "garment")
        mask = _decode_image(body["mask"], "mask") if body.get("mask") else None

        steps = body.get("steps")
        guidance = body.get("guidance_scale")
        seed = body.get("seed")

        with _INFERENCE_LOCK:
            image = RUNNER.try_on(
                person_image=person,
                garment_image=garment,
                cloth_type=cloth_type,
                mask_image=mask,
                steps=int(steps) if steps is not None else None,
                guidance=float(guidance) if guidance is not None else None,
                seed=int(seed) if seed is not None else None,
            )

        return {
            "success": True,
            "image": _encode_png(image),
            "mime_type": "image/png",
            "metadata": {
                "provider": "catvton-local",
                "model_version": MODEL_VERSION,
                "device": RUNNER.status()["device"],
                "cloth_type": cloth_type,
                "steps": int(steps or CONFIG.steps),
                "guidance_scale": float(
                    guidance if guidance is not None else CONFIG.guidance
                ),
                "resolution": f"{CONFIG.width}x{CONFIG.height}",
            },
        }


def main() -> None:
    parser = argparse.ArgumentParser(description="Local CatVTON try-on service")
    parser.add_argument(
        "--host", default=os.environ.get("VTON_SERVICE_HOST", "127.0.0.1")
    )
    parser.add_argument(
        "--port", type=int, default=int(os.environ.get("VTON_SERVICE_PORT", "8188"))
    )
    parser.add_argument(
        "--eager",
        action="store_true",
        default=CONFIG.eager,
        help="load the model at startup instead of on first request",
    )
    args = parser.parse_args()

    health = build_health()
    print(f"CatVTON local service v{SERVICE_VERSION}", flush=True)
    print(f"  listening on http://{args.host}:{args.port}", flush=True)
    print(f"  status       : {health['status']}", flush=True)
    print(f"  device       : {health['backend']['device'] or 'none'}", flush=True)
    if health["reasons"]:
        for reason in health["reasons"]:
            print(f"  ! {reason}", flush=True)
    print(
        "  license      : CatVTON is CC BY-NC-SA 4.0 (non-commercial use only)",
        flush=True,
    )

    if args.eager and health["model"]["available"]:
        print("  preloading model...", flush=True)
        try:
            RUNNER.load()
            print("  model loaded.", flush=True)
        except Exception as exc:
            print(f"  ! preload failed: {exc}", flush=True)

    server = ThreadingHTTPServer((args.host, args.port), Handler)
    server.daemon_threads = True
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nshutting down", flush=True)
        server.shutdown()


if __name__ == "__main__":
    main()
