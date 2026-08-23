"""
CatVTON runner — thin, lazily-loaded wrapper around the official
CatVTON inference pipeline.

    https://github.com/Zheng-Chong/CatVTON   (CC BY-NC-SA 4.0)

Design rules:
  * Importing this module must NEVER fail, even with zero ML
    dependencies installed. The web layer has to be able to answer
    /health and say "model not installed" instead of crashing.
  * Heavy imports (torch, diffusers, CatVTON) happen only inside
    load(), which is called on demand.
  * CPU inference is possible but glacial, so it must be opted into
    explicitly via CATVTON_ALLOW_CPU=true.
"""

from __future__ import annotations

import os
import threading
import time
from dataclasses import dataclass, field
from typing import Any, Optional

# --------------------------------------------------------------------- config


def _env(name: str, default: str = "") -> str:
    return os.environ.get(name, default).strip()


def _env_bool(name: str, default: bool = False) -> bool:
    raw = _env(name).lower()
    if not raw:
        return default
    return raw in ("1", "true", "yes", "on")


def _env_int(name: str, default: int) -> int:
    try:
        return int(_env(name) or default)
    except ValueError:
        return default


@dataclass
class Config:
    # CatVTON weights (auto-downloaded from HuggingFace on first run)
    repo_id: str = field(default_factory=lambda: _env("CATVTON_REPO", "zhengchong/CatVTON"))
    # Base inpainting model. NOTE: the original `runwayml/stable-diffusion-inpainting`
    # repo has been removed from the Hub; a mirror is used by default.
    base_model: str = field(
        default_factory=lambda: _env(
            "CATVTON_BASE_MODEL", "botp/stable-diffusion-v1-5-inpainting"
        )
    )
    width: int = field(default_factory=lambda: _env_int("CATVTON_WIDTH", 768))
    height: int = field(default_factory=lambda: _env_int("CATVTON_HEIGHT", 1024))
    mixed_precision: str = field(
        default_factory=lambda: _env("CATVTON_MIXED_PRECISION", "bf16")
    )
    allow_cpu: bool = field(default_factory=lambda: _env_bool("CATVTON_ALLOW_CPU", False))
    force_device: str = field(default_factory=lambda: _env("CATVTON_DEVICE", ""))
    steps: int = field(default_factory=lambda: _env_int("CATVTON_STEPS", 50))
    guidance: float = field(
        default_factory=lambda: float(_env("CATVTON_GUIDANCE", "2.5") or 2.5)
    )
    # Preload the model at service start instead of on first request.
    eager: bool = field(default_factory=lambda: _env_bool("CATVTON_EAGER_LOAD", False))


CONFIG = Config()

MODEL_VERSION = "catvton-1.0"


# ----------------------------------------------------------------- diagnostics


def probe_backend() -> dict:
    """
    Inspect the local ML stack WITHOUT loading any model.
    Safe to call when torch is not installed at all.
    """
    info: dict[str, Any] = {
        "torch_installed": False,
        "torch_version": None,
        "cuda_available": False,
        "hip_version": None,
        "cuda_version": None,
        "mps_available": False,
        "directml_available": False,
        "devices": [],
        "selected_device": None,
        "device_reason": "",
    }

    try:
        import torch  # noqa: WPS433 (deliberate lazy import)
    except Exception as exc:  # pragma: no cover - depends on host
        info["device_reason"] = f"PyTorch is not installed ({exc.__class__.__name__})."
        return info

    info["torch_installed"] = True
    info["torch_version"] = getattr(torch, "__version__", None)
    info["cuda_version"] = getattr(getattr(torch, "version", None), "cuda", None)
    info["hip_version"] = getattr(getattr(torch, "version", None), "hip", None)

    try:
        info["cuda_available"] = bool(torch.cuda.is_available())
        if info["cuda_available"]:
            for i in range(torch.cuda.device_count()):
                props = torch.cuda.get_device_properties(i)
                info["devices"].append(
                    {
                        "index": i,
                        "name": props.name,
                        "total_memory_gb": round(props.total_memory / 1024**3, 1),
                        # gfx target on ROCm builds, compute capability on CUDA
                        "arch": getattr(props, "gcnArchName", None)
                        or f"sm_{props.major}{props.minor}",
                    }
                )
    except Exception as exc:
        info["device_reason"] = f"CUDA/ROCm probe failed: {exc}"

    try:
        info["mps_available"] = bool(
            getattr(torch.backends, "mps", None) and torch.backends.mps.is_available()
        )
    except Exception:
        pass

    try:
        import torch_directml  # noqa: F401

        info["directml_available"] = True
    except Exception:
        pass

    info["selected_device"], info["device_reason"] = _select_device(info)
    return info


def _select_device(info: dict) -> tuple[Optional[str], str]:
    """Pick the device we would actually run on, and explain why."""
    if CONFIG.force_device:
        return CONFIG.force_device, f"Forced by CATVTON_DEVICE={CONFIG.force_device}."

    if not info["torch_installed"]:
        return None, info["device_reason"] or "PyTorch is not installed."

    if info["cuda_available"]:
        kind = "ROCm/HIP" if info["hip_version"] else "CUDA"
        name = info["devices"][0]["name"] if info["devices"] else "GPU"
        return "cuda", f"{kind} GPU detected ({name})."

    if info["mps_available"]:
        # CatVTON is not validated on Apple Silicon; allow but flag it.
        return "mps", "Apple Metal (MPS) detected — untested with CatVTON."

    if info["directml_available"]:
        return (
            None,
            "torch-directml is installed, but CatVTON's mask stage (DensePose/"
            "detectron2) does not run on DirectML. Not usable.",
        )

    if CONFIG.allow_cpu:
        return "cpu", "No GPU backend found — using CPU because CATVTON_ALLOW_CPU=true."

    return (
        None,
        "No supported GPU backend found. CPU inference is possible but extremely "
        "slow, so it is disabled by default. Set CATVTON_ALLOW_CPU=true to opt in.",
    )


# --------------------------------------------------------------------- runner


class ModelUnavailable(RuntimeError):
    """Raised when the model cannot be loaded on this machine."""


class CatVTONRunner:
    """Loads CatVTON once and serves inference requests serially."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._pipeline: Any = None
        self._automasker: Any = None
        self._mask_processor: Any = None
        self._device: Optional[str] = None
        self._load_error: Optional[str] = None
        self._loading = False
        self._loaded_at: Optional[float] = None
        self._repo_path: Optional[str] = None

    # ------------------------------------------------------------ properties

    @property
    def loaded(self) -> bool:
        return self._pipeline is not None

    @property
    def loading(self) -> bool:
        return self._loading

    @property
    def load_error(self) -> Optional[str]:
        return self._load_error

    @property
    def automasker_available(self) -> bool:
        return self._automasker is not None

    def status(self) -> dict:
        return {
            "loaded": self.loaded,
            "loading": self._loading,
            "load_error": self._load_error,
            "device": self._device,
            "automasker": self.automasker_available,
            "loaded_at": self._loaded_at,
            "model_version": MODEL_VERSION,
            "repo_id": CONFIG.repo_id,
            "base_model": CONFIG.base_model,
            "resolution": f"{CONFIG.width}x{CONFIG.height}",
            "mixed_precision": CONFIG.mixed_precision,
        }

    # ---------------------------------------------------------------- loading

    def load(self) -> None:
        """Load the pipeline. Raises ModelUnavailable with a clear reason."""
        if self._pipeline is not None:
            return

        with self._lock:
            if self._pipeline is not None:
                return

            probe = probe_backend()
            device = probe["selected_device"]
            if not device:
                self._load_error = probe["device_reason"]
                raise ModelUnavailable(self._load_error)

            self._loading = True
            try:
                self._load_inner(device)
                self._loaded_at = time.time()
                self._load_error = None
            except ModelUnavailable:
                raise
            except Exception as exc:
                self._load_error = f"{exc.__class__.__name__}: {exc}"
                raise ModelUnavailable(self._load_error) from exc
            finally:
                self._loading = False

    def _load_inner(self, device: str) -> None:
        try:
            from huggingface_hub import snapshot_download
        except Exception as exc:
            raise ModelUnavailable(
                "huggingface_hub is not installed. Run: "
                "pip install -r vton-service/requirements.txt"
            ) from exc

        try:
            from diffusers.image_processor import VaeImageProcessor
        except Exception as exc:
            raise ModelUnavailable(
                "diffusers is not installed. Run: "
                "pip install -r vton-service/requirements.txt"
            ) from exc

        # CatVTON's own modules — these come from the cloned CatVTON repo,
        # which must be importable (CATVTON_PATH or installed alongside).
        try:
            from model.pipeline import CatVTONPipeline  # type: ignore
            from utils import init_weight_dtype  # type: ignore
        except Exception as exc:
            raise ModelUnavailable(
                "The CatVTON source could not be imported. Clone it and point "
                "CATVTON_PATH at the checkout:\n"
                "  git clone https://github.com/Zheng-Chong/CatVTON\n"
                "  set CATVTON_PATH=C:\\path\\to\\CatVTON\n"
                f"(import error: {exc})"
            ) from exc

        # Downloads on first run (several GB), cached afterwards in HF_HOME.
        repo_path = snapshot_download(repo_id=CONFIG.repo_id)
        self._repo_path = repo_path

        self._pipeline = CatVTONPipeline(
            base_ckpt=CONFIG.base_model,
            attn_ckpt=repo_path,
            attn_ckpt_version="mix",
            weight_dtype=init_weight_dtype(CONFIG.mixed_precision),
            use_tf32=True,
            device=device,
        )
        self._device = device
        self._mask_processor = VaeImageProcessor(
            vae_scale_factor=8,
            do_normalize=False,
            do_binarize=True,
            do_convert_grayscale=True,
        )

        # AutoMasker needs DensePose (detectron2) + SCHP. It is optional:
        # without it the caller must supply a mask.
        try:
            from model.cloth_masker import AutoMasker  # type: ignore

            self._automasker = AutoMasker(
                densepose_ckpt=os.path.join(repo_path, "DensePose"),
                schp_ckpt=os.path.join(repo_path, "SCHP"),
                device=device,
            )
        except Exception as exc:  # detectron2 missing, etc.
            self._automasker = None
            print(
                f"[catvton] AutoMasker unavailable ({exc.__class__.__name__}: {exc}). "
                "Automatic garment masking is disabled; requests must supply a mask.",
                flush=True,
            )

    # -------------------------------------------------------------- inference

    def try_on(
        self,
        person_image,
        garment_image,
        cloth_type: str = "upper",
        mask_image=None,
        steps: Optional[int] = None,
        guidance: Optional[float] = None,
        seed: Optional[int] = None,
    ):
        """
        Run a single person + single garment try-on.
        Returns a PIL image. Raises ModelUnavailable / RuntimeError.
        """
        self.load()

        import torch  # safe: load() succeeded
        from utils import resize_and_crop, resize_and_padding  # type: ignore

        person = resize_and_crop(person_image, (CONFIG.width, CONFIG.height))
        garment = resize_and_padding(garment_image, (CONFIG.width, CONFIG.height))

        if mask_image is not None:
            mask = resize_and_crop(mask_image, (CONFIG.width, CONFIG.height))
        else:
            if self._automasker is None:
                raise RuntimeError(
                    "No mask supplied and automatic masking is unavailable. "
                    "Install DensePose/detectron2 (see CatVTON INSTALL.md) or send "
                    "a mask with the request."
                )
            mask = self._automasker(person, cloth_type)["mask"]

        mask = self._mask_processor.blur(mask, blur_factor=9)

        generator = None
        if seed is not None and seed >= 0:
            generator = torch.Generator(device=self._device).manual_seed(int(seed))

        result = self._pipeline(
            image=person,
            condition_image=garment,
            mask=mask,
            num_inference_steps=int(steps or CONFIG.steps),
            guidance_scale=float(guidance if guidance is not None else CONFIG.guidance),
            generator=generator,
        )[0]
        return result


RUNNER = CatVTONRunner()
