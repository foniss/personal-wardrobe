# fitcheck — the intelligent wardrobe

Photograph the clothes you own, let a colour-theory engine build outfits from
them, and see those outfits on a real person using a **local** AI virtual
try-on model.

```
WARDROBE ──▶ IMAGE PROCESSING ──▶ COLOUR / PALETTE EXTRACTION ──▶ DATABASE
                                                                     │
                                                                     ▼
                                                            OUTFIT MATCHING
                                                                     │
                                                                     ▼
                                                        OUTFIT RECOMMENDATION
                                                                     │
      USER REFERENCE PHOTO ──┐                                       │
      ACTUAL GARMENT IMAGES ─┼───────────────▶ LOCAL VTON SERVICE ◀───┘
                             │                        │
                             │                        ▼
                             └──────────────▶ REALISTIC TRY-ON IMAGE
```

The matcher decides **what** to wear. The try-on system only decides **how it
looks**. Neither knows about the other.

---

## Table of contents

- [Quick start (website only)](#quick-start-website-only)
- [Local Virtual Try-On](#local-virtual-try-on)
  - [What it is](#what-it-is)
  - [Hardware requirements — read this first](#hardware-requirements--read-this-first)
  - [Can my AMD RX 6600 XT run it?](#can-my-amd-rx-6600-xt-run-it)
  - [Windows setup](#windows-setup)
  - [Linux setup](#linux-setup)
  - [Where the model is downloaded](#where-the-model-is-downloaded)
  - [Starting the service](#starting-the-service)
  - [Your first test](#your-first-test)
  - [Troubleshooting](#troubleshooting)
  - [Limitations](#limitations)
- [Architecture](#architecture)
- [Configuration](#configuration)
- [Licensing & attribution](#licensing--attribution)

---

## Quick start (website only)

The website is fully functional **without** any AI try-on. Wardrobe, uploads,
colour extraction, outfit matching and saved outfits all work offline with no
extra setup.

**Requirements:** Node.js 20+, PostgreSQL 14+.

```bash
npm install
cp .env.example .env          # adjust DATABASE_URL if needed
npx drizzle-kit push          # create tables
npm run dev                   # http://localhost:3000
```

Optional: `npx tsx scripts/seed.ts` loads a small starter wardrobe.

---

## Local Virtual Try-On

### What it is

Virtual try-on (VTON) takes **a photo of a person** and **a photo of a
garment** and synthesizes a realistic image of that person wearing that
garment — preserving the garment's real colour, pattern, print and cut.

This project uses [**CatVTON**](https://github.com/Zheng-Chong/CatVTON) as the
first local provider. CatVTON is a lightweight diffusion try-on model
(899M params total) built on Stable Diffusion v1.5 inpainting.

Everything runs **on your machine**:

- no API key
- no cloud service
- no image hosting
- your reference photo, wardrobe photos and generated results never leave
  `localhost`

Reference photos and generated images are stored **outside the web root** in
`.data/private/` and served only through an authenticated media route.

### Hardware requirements — read this first

These come from the [official CatVTON
documentation](https://github.com/Zheng-Chong/CatVTON), not from guesswork:

| Item | Requirement |
| --- | --- |
| Python | 3.9 (per CatVTON's INSTALL.md; 3.10/3.11 usually work) |
| GPU | **NVIDIA CUDA GPU with ~8 GB VRAM** for 1024×768 with `bf16` |
| Disk | ~10–15 GB for the base model + CatVTON weights + DensePose/SCHP |
| Download | Several GB on first run, cached afterwards |
| Node.js | 20+ (for the website) |

`bf16` mixed precision — the configuration CatVTON documents for the <8 GB
figure — needs an **Ampere-or-newer** NVIDIA GPU (RTX 30xx/40xx, A-series).
On older CUDA cards use `CATVTON_MIXED_PRECISION=fp16`.

### Can my AMD RX 6600 XT run it?

**Short answer: no — not on Windows, and not in any officially supported
configuration.** I checked rather than assumed:

Your card is **gfx1032 (RDNA2)**. From AMD's own ROCm support matrices:

| Path | RX 6600 XT (gfx1032) | Source |
| --- | --- | --- |
| Windows HIP SDK | ❌ Not supported | [ROCm Windows system requirements](https://rocm.docs.amd.com/projects/install-on-windows/en/latest/reference/system-requirements.html) |
| Official PyTorch ROCm wheels on Windows | ❌ Does not exist (AMD ships Windows wheels for RDNA3/RDNA4 only) | AMD PyTorch wheel index |
| ROCm in WSL2 | ❌ WSL2 ROCm covers RX 7900 series / RDNA4 only | ROCm WSL docs |
| ROCm on native **Linux** | ⚠️ Not officially supported, but commonly works with `HSA_OVERRIDE_GFX_VERSION=10.3.0` | Community-standard workaround |
| DirectML on Windows | ❌ Not viable here — CatVTON's mask stage (DensePose/detectron2) has no DirectML path | detectron2 requires CUDA or CPU |
| CPU | ⚠️ Technically runs, realistically unusable (many minutes per image) | — |

**What this means for you:**

1. **On your current Windows + RX 6600 XT machine, real CatVTON generation
   will not work.** The app detects this and tells you exactly why instead of
   pretending. You still get the full website, matcher, wardrobe and the
   honest "Virtual Try-On Not Installed" state with diagnostics.
2. **Your most realistic path to actually running it** is either:
   - an NVIDIA GPU (borrowed machine, desktop, or a cloud GPU box), **or**
   - dual-boot/native **Linux** with ROCm and `HSA_OVERRIDE_GFX_VERSION=10.3.0`.
     This is unofficial and **I have not tested it on this card** — treat it as
     "worth trying", not "supported". DensePose/detectron2 on ROCm is the most
     likely thing to break.
3. **CPU fallback exists but is deliberately opt-in** (`CATVTON_ALLOW_CPU=true`)
   so the app never *looks* frozen by default. Expect several minutes per
   image, and raise `VTON_TIMEOUT_MS` accordingly.

The provider architecture means none of this is a dead end — a different local
VTON model (or a cloud provider) can be dropped in without touching the
matcher or the UI. See [Architecture](#architecture).

### Windows setup

> Run these in **PowerShell**. Replace paths with your own.

**1. Install prerequisites**

- [Python 3.9+](https://www.python.org/downloads/) (tick *Add Python to PATH*)
- [Git](https://git-scm.com/download/win)
- [Node.js 20+](https://nodejs.org/)
- NVIDIA driver + a CUDA-capable GPU

**2. Clone CatVTON somewhere outside this repo**

```powershell
cd C:\dev
git clone https://github.com/Zheng-Chong/CatVTON
```

**3. Create a Python environment for the try-on service**

```powershell
cd C:\dev\fitcheck            # this repository
python -m venv vton-service\.venv
.\vton-service\.venv\Scripts\Activate.ps1
```

**4. Install PyTorch first (must match your GPU), then the rest**

```powershell
# NVIDIA / CUDA 12.1
pip install torch torchvision --index-url https://download.pytorch.org/whl/cu121

pip install -r vton-service\requirements.txt
```

**5. (Optional but recommended) automatic garment masking**

CatVTON's `AutoMasker` uses DensePose, which needs `detectron2`. Without it the
service still runs, but every request must carry its own mask.

```powershell
pip install "git+https://github.com/facebookresearch/detectron2.git"
```

`detectron2` has no Windows wheel and needs MSVC Build Tools; if it fails, see
[CatVTON issue #8](https://github.com/Zheng-Chong/CatVTON/issues/8). The
service reports `auto_mask: false` when it is missing.

**6. Point the service at your CatVTON checkout and start it**

```powershell
$env:CATVTON_PATH = "C:\dev\CatVTON"
python vton-service\server.py
```

### Linux setup

```bash
git clone https://github.com/Zheng-Chong/CatVTON ~/CatVTON

python3 -m venv vton-service/.venv
source vton-service/.venv/bin/activate

# NVIDIA
pip install torch torchvision --index-url https://download.pytorch.org/whl/cu121
# AMD (unofficial for RDNA2 — see the AMD section above)
# pip install torch torchvision --index-url https://download.pytorch.org/whl/rocm6.2
# export HSA_OVERRIDE_GFX_VERSION=10.3.0

pip install -r vton-service/requirements.txt
pip install "git+https://github.com/facebookresearch/detectron2.git"   # optional

export CATVTON_PATH=~/CatVTON
python vton-service/server.py
```

### Where the model is downloaded

Nothing is committed to this repository. On the **first generation** the
service downloads, via `huggingface_hub`:

| What | From | Approx. size |
| --- | --- | --- |
| CatVTON weights (+ DensePose, SCHP) | [`zhengchong/CatVTON`](https://huggingface.co/zhengchong/CatVTON) | ~5 GB |
| SD 1.5 inpainting base | `botp/stable-diffusion-v1-5-inpainting` | ~4 GB |

They land in your HuggingFace cache:

- Windows: `C:\Users\<you>\.cache\huggingface\hub`
- Linux/macOS: `~/.cache/huggingface/hub`

Set `HF_HOME` to move it elsewhere. The first run takes a while; later runs
are instant.

> **Note:** CatVTON's default base model `runwayml/stable-diffusion-inpainting`
> was removed from the Hub, so this project defaults to a mirror. Override with
> `CATVTON_BASE_MODEL` if you prefer a different one.

### Starting the service

```bash
python vton-service/server.py                      # 127.0.0.1:8188
python vton-service/server.py --port 9000          # custom port
python vton-service/server.py --eager              # load model at startup
```

The service is built on the Python **standard library**, so it starts even
with nothing installed and honestly reports what is missing:

```
CatVTON local service v1.0.0
  listening on http://127.0.0.1:8188
  status       : unavailable
  device       : none
  ! PyTorch is not installed (ModuleNotFoundError).
```

Check it any time:

```bash
curl http://127.0.0.1:8188/health
```

It reports service state, model state, torch/CUDA/ROCm/MPS detection, the
selected device (and *why*), and whether auto-masking is available. The
website surfaces the same information as a status pill:

```
● Virtual Try-On Ready        ○ Virtual Try-On Not Installed
                              ○ Virtual Try-On Not Running
```

### Your first test

1. Start PostgreSQL, then `npm run dev`.
2. Start the VTON service: `python vton-service/server.py`.
3. Open <http://localhost:3000> and check the pill says **Virtual Try-On Ready**
   (Match studio page).
4. **Wardrobe →** upload a few clothes (or `npx tsx scripts/seed.ts`).
5. **My model →** *Upload myself* → a clear, front-facing, full-body photo.
6. **Match studio →** pick an anchor piece; the matcher builds outfits.
7. Click **Generate try-on**.
8. First run downloads weights (slow). After that a GPU run is typically
   ~10–60 s. The result appears as the main image; **Try again** re-runs it.

### Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| `Virtual Try-On Not Running` | Service isn't started, or `VTON_SERVICE_URL` doesn't match the port |
| `PyTorch is not installed` | Activate the venv and install torch from the right index URL |
| `The CatVTON source could not be imported` | Set `CATVTON_PATH` to your CatVTON clone |
| `No supported GPU backend found` | No CUDA device. Set `CATVTON_ALLOW_CPU=true` to opt into (very slow) CPU |
| `No mask supplied and automatic masking is unavailable` | Install `detectron2`, or send a mask with the request |
| CUDA out of memory | Lower `CATVTON_HEIGHT`/`CATVTON_WIDTH` (e.g. 512×384), or use `fp16` |
| `bf16` errors on older NVIDIA cards | `CATVTON_MIXED_PRECISION=fp16` |
| Generation times out | Raise `VTON_TIMEOUT_MS` (CPU needs minutes) |
| Weights re-download every run | Set a stable `HF_HOME` |

### Limitations

1. **One garment per generation (by design).** CatVTON's inference is
   person + one garment. The app renders the outfit's primary garment
   (dress → top → bottom → outerwear) and reports the rest as *not rendered
   this pass* rather than faking them. Multi-garment chaining is the next
   milestone.
2. **Front view only.** CatVTON reproduces the pose of your reference photo,
   so 3/4 / side / back are present in the UI but disabled until a
   pose-capable provider is added.
3. **Shoes and accessories are never rendered** — CatVTON has no category for
   them.
4. **No local person generation.** "Create a virtual model" needs a
   text-to-image model; the local provider does try-on only and tells you to
   upload a photo instead.
5. **Result quality depends heavily on the reference photo** — full body,
   front-facing, plain background, fitted clothing.
6. **CatVTON was not executed on the development machine** used to build this
   integration (no CUDA GPU available there). The service, HTTP contract,
   provider adapter, caching, error handling and UI were verified end to end;
   the CatVTON model call itself follows the official `app.py` API but has not
   been run against real weights here.

---

## Architecture

```
 Frontend (React)
      │  never talks to Python directly
      ▼
 /api/try-on            ── validation, job creation, polling
      ▼
 TryOnService           ── resolves real garment images, cache key, storage
      ▼
 Provider registry      ── TRYON_PROVIDER selects the adapter
      ├── CatVtonLocalProvider  ──HTTP──▶ vton-service/server.py ──▶ CatVTON
      ├── FalTryOnProvider       (optional cloud)
      └── GeminiTryOnProvider    (optional cloud)
```

Key files:

| Path | Role |
| --- | --- |
| `src/lib/matcher.ts` | Outfit engine — **knows nothing about AI** |
| `src/lib/tryon/types.ts` | `VirtualTryOnProvider` contract |
| `src/lib/tryon/registry.ts` | Provider selection |
| `src/lib/tryon/providers/catvton-local.ts` | Local adapter (HTTP → Python) |
| `src/server/tryon-service.ts` | Orchestration, caching, jobs |
| `src/server/private-store.ts` | Private image storage outside the web root |
| `vton-service/server.py` | Stdlib HTTP service (`/health`, `/try-on`) |
| `vton-service/catvton_runner.py` | Lazy CatVTON loader + device detection |

**Caching.** Results are keyed on
`reference model + exact garment set + view + provider + generation settings`.
Identical requests reuse the stored image and cost nothing; changing a garment,
or any of `CATVTON_STEPS/GUIDANCE/WIDTH/HEIGHT/BASE_MODEL`, produces a new key.
**Try again** forces a fresh run.

**Adding a provider.** Implement `VirtualTryOnProvider`, register it in
`registry.ts`, select it with `TRYON_PROVIDER`. Nothing else changes.

---

## Configuration

All configuration is environment-based — no source edits required. See
[`.env.example`](.env.example) for the full annotated list.

| Variable | Default | Purpose |
| --- | --- | --- |
| `VTON_ENABLED` | `true` | Master switch for local try-on |
| `TRYON_PROVIDER` | first available | `catvton` \| `fal` \| `gemini` |
| `VTON_SERVICE_URL` | `http://127.0.0.1:8188` | Where the Python service listens |
| `VTON_TIMEOUT_MS` | `600000` | Next.js wait limit for a generation |
| `CATVTON_PATH` | — | Path to your CatVTON checkout |
| `CATVTON_DEVICE` | auto | Force `cuda` / `cpu` / `mps` |
| `CATVTON_ALLOW_CPU` | `false` | Opt into (slow) CPU inference |
| `CATVTON_STEPS` / `CATVTON_GUIDANCE` | `50` / `2.5` | Sampling settings |
| `CATVTON_WIDTH` / `CATVTON_HEIGHT` | `768` / `1024` | Output resolution |

**No API key is required for local mode.** `FAL_KEY` / `GEMINI_API_KEY` are
optional and only used if you deliberately choose a cloud provider.

Never committed: `.env`, `.data/`, `/public/uploads/`, model weights,
`node_modules/`, Python virtualenvs.

---

## Licensing & attribution

These are **separate** licences — please read before any commercial use.

### This application

The application code in this repository (Next.js app, matcher, wardrobe,
provider abstraction, Python service wrapper) is yours to license as you wish.

### ⚠️ CatVTON — non-commercial only

> All the materials, including code, checkpoints, and demo, are made available
> under the **Creative Commons BY-NC-SA 4.0** license.
> — [CatVTON README](https://github.com/Zheng-Chong/CatVTON)

**This means that if you enable the CatVTON provider, that part of your
deployment is restricted to non-commercial use**, and derivative works must be
shared under the same licence with attribution. You **cannot** describe the
combined product as freely usable commercially while CatVTON is enabled.

To go commercial you must replace the provider with a
commercially-licensed VTON model — which the provider abstraction is designed
to make a one-file change.

```bibtex
@misc{chong2024catvtonconcatenationneedvirtual,
  title={CatVTON: Concatenation Is All You Need for Virtual Try-On with Diffusion Models},
  author={Zheng Chong and Xiao Dong and Haoxiang Li and Shiyue Zhang and Wenqing Zhang
          and Xujie Zhang and Hanqing Zhao and Xiaodan Liang},
  year={2024}, eprint={2407.15886}, archivePrefix={arXiv}, primaryClass={cs.CV},
  url={https://arxiv.org/abs/2407.15886}
}
```

### Third-party components

| Component | Licence |
| --- | --- |
| [CatVTON](https://github.com/Zheng-Chong/CatVTON) | CC BY-NC-SA 4.0 (**non-commercial**) |
| Stable Diffusion v1.5 inpainting (base model) | CreativeML OpenRAIL-M |
| [SCHP](https://github.com/GoGoDuck912/Self-Correction-Human-Parsing) | MIT |
| [DensePose / detectron2](https://github.com/facebookresearch/detectron2) | Apache 2.0 |
| [Diffusers](https://github.com/huggingface/diffusers) | Apache 2.0 |
| Next.js, React, Drizzle ORM | MIT / Apache 2.0 |
