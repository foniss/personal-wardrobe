"""
Standalone CatVTON inference test.

Usage (from the wardrobe project root, with .venv-vton activated):

    python test_inference.py

Or with explicit paths / options:

    python test_inference.py --person test-images/person.png \
                              --garment test-images/shirt.png \
                              --mask test-images/mask.png \
                              --output test-images/result.png \
                              --steps 10 --seed 42

Environment variables are read from .env automatically if python-dotenv
is installed; otherwise set them in the shell before running.
"""

import argparse
import os
import sys
import time

# ---------------------------------------------------------------------------
# Load .env (best-effort — not required)
# ---------------------------------------------------------------------------
try:
    from dotenv import load_dotenv
    _env_path = os.path.join(os.path.dirname(__file__), ".env")
    if os.path.exists(_env_path):
        load_dotenv(_env_path, override=False)  # shell env takes priority
        print(f"[test] Loaded .env from {_env_path}", flush=True)
except ImportError:
    print("[test] python-dotenv not installed; env vars from shell only.", flush=True)

# ---------------------------------------------------------------------------
# Make sure CatVTON source is importable
# ---------------------------------------------------------------------------
_catvton_path = os.environ.get("CATVTON_PATH", os.path.join(os.path.dirname(__file__), "CatVTON"))
if os.path.isdir(_catvton_path) and _catvton_path not in sys.path:
    sys.path.insert(0, _catvton_path)
    print(f"[test] Added CatVTON path: {_catvton_path}", flush=True)

# ---------------------------------------------------------------------------
# CLI arguments
# ---------------------------------------------------------------------------
parser = argparse.ArgumentParser(description="CatVTON inference test")
parser.add_argument("--person",  default="test-images/person.png")
parser.add_argument("--garment", default="test-images/shirt.png")
parser.add_argument("--mask",    default="test-images/mask.png")
parser.add_argument("--output",  default="test-images/result.png")
parser.add_argument("--steps",   type=int,   default=10)
parser.add_argument("--seed",    type=int,   default=42)
parser.add_argument("--guidance", type=float, default=2.5)
parser.add_argument("--cloth-type", default="upper")
args = parser.parse_args()

# ---------------------------------------------------------------------------
# Verify input files exist
# ---------------------------------------------------------------------------
for label, path in [("person", args.person), ("garment", args.garment), ("mask", args.mask)]:
    if not os.path.exists(path):
        print(f"[test] ERROR: {label} image not found at '{path}'", flush=True)
        sys.exit(1)

print(f"[test] Person  : {args.person}", flush=True)
print(f"[test] Garment : {args.garment}", flush=True)
print(f"[test] Mask    : {args.mask}", flush=True)
print(f"[test] Output  : {args.output}", flush=True)
print(f"[test] Steps   : {args.steps}", flush=True)
print(f"[test] Seed    : {args.seed}", flush=True)
print(f"[test] Guidance: {args.guidance}", flush=True)
print(flush=True)

# ---------------------------------------------------------------------------
# Import PIL
# ---------------------------------------------------------------------------
try:
    from PIL import Image
except ImportError:
    print("[test] ERROR: Pillow is not installed. Run: pip install Pillow", flush=True)
    sys.exit(1)

# ---------------------------------------------------------------------------
# Import torch and report device/VRAM
# ---------------------------------------------------------------------------
try:
    import torch
except ImportError:
    print("[test] ERROR: torch is not installed.", flush=True)
    sys.exit(1)

print(f"[test] PyTorch : {torch.__version__}", flush=True)
if torch.cuda.is_available():
    dev = torch.cuda.get_device_properties(0)
    free, total = torch.cuda.mem_get_info(0)
    print(f"[test] Device  : {dev.name}", flush=True)
    print(f"[test] VRAM    : {free/1024**3:.2f}/{total/1024**3:.2f} GB free", flush=True)
else:
    print("[test] WARNING: CUDA/ROCm not available!", flush=True)

print(flush=True)

# ---------------------------------------------------------------------------
# Import runner (lazy — does NOT load the model yet)
# ---------------------------------------------------------------------------
_service_dir = os.path.join(os.path.dirname(__file__), "vton-service")
if _service_dir not in sys.path:
    sys.path.insert(0, _service_dir)

from catvton_runner import RUNNER, CONFIG  # noqa: E402

print(f"[test] Config — resolution: {CONFIG.width}x{CONFIG.height}", flush=True)
print(f"[test] Config — precision : {CONFIG.mixed_precision}", flush=True)
print(f"[test] Config — steps     : {CONFIG.steps}", flush=True)
print(f"[test] Config — chunk_thr : {CONFIG.attn_chunk_threshold}", flush=True)
print(f"[test] Config — chunk_sz  : {CONFIG.attn_chunk_size}", flush=True)
print(flush=True)

# ---------------------------------------------------------------------------
# Load images
# ---------------------------------------------------------------------------
person_img  = Image.open(args.person).convert("RGB")
garment_img = Image.open(args.garment).convert("RGB")
mask_img    = Image.open(args.mask).convert("L")

print(f"[test] Loaded person  {person_img.size}", flush=True)
print(f"[test] Loaded garment {garment_img.size}", flush=True)
print(f"[test] Loaded mask    {mask_img.size}", flush=True)
print(flush=True)

# ---------------------------------------------------------------------------
# Run inference
# ---------------------------------------------------------------------------
print("[test] Starting inference (model will load on first call)…", flush=True)
t_start = time.time()

try:
    result = RUNNER.try_on(
        person_image  = person_img,
        garment_image = garment_img,
        cloth_type    = args.cloth_type,
        mask_image    = mask_img,
        steps         = args.steps,
        guidance      = args.guidance,
        seed          = args.seed,
    )
except Exception as exc:
    import traceback
    print(f"[test] FAILED: {exc.__class__.__name__}: {exc}", flush=True)
    traceback.print_exc()
    sys.exit(1)

elapsed = time.time() - t_start
print(f"\n[test] Inference completed in {elapsed:.1f}s", flush=True)

# ---------------------------------------------------------------------------
# Save result
# ---------------------------------------------------------------------------
os.makedirs(os.path.dirname(os.path.abspath(args.output)), exist_ok=True)
result.save(args.output)
print(f"[test] Result saved to: {args.output}", flush=True)

if torch.cuda.is_available():
    free, total = torch.cuda.mem_get_info(0)
    print(f"[test] VRAM after inference: {free/1024**3:.2f}/{total/1024**3:.2f} GB free", flush=True)

print("\n[test] SUCCESS ✓", flush=True)
