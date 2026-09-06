import torch
import torch_directml

from fashn_vton.tryon_mmdit import (
    TryOnModel,
    prepare,
    unpack_images,
)
from fashn_vton.utils import load_checkpoint
from einops import rearrange


# ============================================================
# DEVICE
# ============================================================

d = torch_directml.device()

print("PyTorch:", torch.__version__)
print("DirectML:", d)


# ============================================================
# LOAD CHECKPOINT
# ============================================================

print("\nLoading checkpoint...")

sd = load_checkpoint(
    r".\weights\model.safetensors",
    device="cpu",
)

print("Checkpoint tensors:", len(sd))


# ============================================================
# CREATE MODEL
# ============================================================

print("\nCreating model...")

model = TryOnModel()

model.load_state_dict(sd)

del sd

model.to(d).eval()

print("Model device:", next(model.parameters()).device)


# ============================================================
# CREATE TEST INPUTS
# ============================================================

# Model expects:
#
# x              = 3 channels
# ca_images      = 3 channels
# person_poses   = 1 channel
#
# garment_images = 3 channels
# garment_poses  = 1 channel

print("\nCreating tensors...")

x = torch.randn(
    1, 3, 864, 576,
    device=d,
)

ca = torch.randn(
    1, 3, 864, 576,
    device=d,
)

garment = torch.randn(
    1, 3, 864, 576,
    device=d,
)

pp = torch.randn(
    1, 1, 864, 576,
    device=d,
)

gp = torch.randn(
    1, 1, 864, 576,
    device=d,
)

times = torch.tensor(
    [0.5],
    device=d,
)

cats = torch.tensor(
    [1],
    dtype=torch.long,
    device=d,
)

print("Inputs ready")


# ============================================================
# DEBUG FORWARD PASS
# ============================================================

with torch.no_grad():

    # --------------------------------------------------------
    # [1] PERSON INPUTS
    # --------------------------------------------------------

    print("\n[1] Concatenating person inputs...")

    person = torch.cat(
        [x, ca, pp],
        dim=1,
    )

    print(
        "person:",
        person.shape,
        person.device,
    )


    # --------------------------------------------------------
    # [2] X EMBEDDER
    # --------------------------------------------------------

    print("\n[2] x_embedder...")

    img = model.x_embedder(person)

    print(
        "embedded:",
        img.shape,
        img.device,
    )


    # --------------------------------------------------------
    # [3] PREPARE IMAGE SEQUENCE
    # --------------------------------------------------------

    print("\n[3] prepare...")

    img, x_ids = prepare(img)

    print(
        "img:",
        img.shape,
        img.device,
    )

    print(
        "x_ids:",
        x_ids.shape,
        x_ids.device,
    )


    # --------------------------------------------------------
    # [4] GARMENT INPUTS
    # --------------------------------------------------------

    print("\n[4] garment inputs...")

    g = torch.cat(
        [garment, gp],
        dim=1,
    )

    print(
        "garment:",
        g.shape,
        g.device,
    )


    # --------------------------------------------------------
    # [5] GARMENT EMBEDDER
    # --------------------------------------------------------

    print("\n[5] garment_embedder...")

    g = model.garment_embedder(g)

    print(
        "garment embedded:",
        g.shape,
        g.device,
    )


    # --------------------------------------------------------
    # [6] GARMENT PREPARE
    # --------------------------------------------------------

    print("\n[6] garment prepare...")

    g, g_ids = prepare(g)

    print(
        "g:",
        g.shape,
        g.device,
    )

    print(
        "g_ids:",
        g_ids.shape,
        g_ids.device,
    )


    # --------------------------------------------------------
    # [7] TIMESTEP EMBEDDING
    # --------------------------------------------------------

    print("\n[7] timestep embedding...")

    t = model.t_embedder(times)

    print(
        "t:",
        t.shape,
        t.device,
    )


    # --------------------------------------------------------
    # [8] CATEGORY EMBEDDING
    # --------------------------------------------------------

    print("\n[8] category embedding...")

    y = model.y_embedder(cats)

    print(
        "y:",
        y.shape,
        y.device,
    )

    t = t + y

    print(
        "combined t:",
        t.shape,
        t.device,
    )


    # --------------------------------------------------------
    # [9] IMAGE POSITIONAL EMBEDDING
    # --------------------------------------------------------

    print("\n[9] x positional embedding...")

    x_pe = model.pe_embedder(x_ids)

    print(
        "x_pe:",
        x_pe.shape,
        x_pe.device,
    )


    # --------------------------------------------------------
    # [10] GARMENT POSITIONAL EMBEDDING
    # --------------------------------------------------------

    print("\n[10] garment positional embedding...")

    g_pe = model.pe_embedder(g_ids)

    print(
        "g_pe:",
        g_pe.shape,
        g_pe.device,
    )


    # --------------------------------------------------------
    # [11] CONCATENATE POSITIONAL EMBEDDINGS
    # --------------------------------------------------------

    print("\n[11] concatenate positional embeddings...")

    pe = torch.cat(
        [x_pe, g_pe],
        dim=1,
    )

    print(
        "pe:",
        pe.shape,
        pe.device,
    )


    # --------------------------------------------------------
    # [12] PATCH MIXER
    # --------------------------------------------------------

    print("\n[12] PATCH MIXER...")

    for i, block in enumerate(model.x_patch_mixer):

        print(
            f"  Block {i + 1}/{len(model.x_patch_mixer)}..."
        )

        img = block(
            img,
            vec=t,
            pe=x_pe,
        )

        print(
            "  output:",
            img.shape,
            img.device,
        )

    print("\nPATCH MIXER SUCCESS")


    print("\n[13] DOUBLE STREAM BLOCKS...")

    # Start from the outputs of the patch mixer.
    # IMPORTANT: use `img`, not the original `x`.
    txt = g

    print("Initial img:", img.shape, img.device)
    print("Initial txt:", txt.shape, txt.device)
    print("PE:", pe.shape, pe.device)
    print("vec:", t.shape, t.device)

    for i, block in enumerate(model.double_blocks):
        print(f"\n  Double Block {i + 1}/8...")

        img, txt = block(
            img=img,
            txt=txt,
            vec=t,
            pe=pe,
        )

    print("  img:", img.shape, img.device)
    print("  txt:", txt.shape, txt.device)

    print("\nALL DOUBLE STREAM BLOCKS SUCCESS")

    print("\n[14] CONCATENATING IMAGE + GARMENT STREAMS...")

    # Save token counts BEFORE concatenating.
    garment_token_count = txt.shape[1]
    person_token_count = img.shape[1]

    print("garment tokens:", garment_token_count)
    print("person tokens:", person_token_count)

    combined = torch.cat(
        (txt, img),
        dim=1,
    )

    print("combined:", combined.shape, combined.device)

    print("\n[15] SINGLE STREAM BLOCKS...")

    img = combined

    for i, block in enumerate(model.single_blocks):
        print(f"\n  Single Block {i + 1}/16...")

        img = block(
            img,
            vec=t,
            pe=pe,
        )

    print("output:", img.shape, img.device)
    print("\nALL SINGLE STREAM BLOCKS SUCCESS")
        # ================================================================
    # [16] REMOVE GARMENT/TEXT TOKENS
    # ================================================================
    print("\n[16] REMOVING GARMENT TOKENS...")

    print("combined before removal:", img.shape)

    img = img[:, garment_token_count:, :]

    print("person tokens remaining:", img.shape)

    print("\n[17] FINAL LAYER...")

    print("Moving final layer to CPU...")
    model.final_layer.to("cpu")

    img_cpu = img.to("cpu")
    t_cpu = t.to("cpu")

    print("img CPU:", img_cpu.shape, img_cpu.device)
    print("t CPU:", t_cpu.shape, t_cpu.device)

    print("Running final layer on CPU...")

    with torch.no_grad():
        img_cpu = model.final_layer(
            img_cpu,
            t_cpu,
        )

    print("final layer output:", img_cpu.shape, img_cpu.device)

    print("Moving output back to DirectML...")

    img = img_cpu.to(d)

    print("final layer output:", img.shape, img.device)

    print("Moving final-layer output back to DirectML...")

    img = img_cpu.to(d)

    print("final layer output:", img.shape, img.device)

    print("\n[18] REARRANGING PATCHES...")

    img = rearrange(
        img,
        "b (h w) c -> b c h w",
        h=model.input_shape[0] // model.patch_size,
        w=model.input_shape[1] // model.patch_size,
    )

    print("patch grid:", img.shape, img.device)

    print("\n[19] UNPACKING IMAGE...")

    if model.patch_size > 1:
        img = unpack_images(
            img,
            model.patch_size,
        )

    print("FINAL IMAGE:", img.shape, img.device)

    print("\n=== FULL FORWARD PASS SUCCESS ===")

print("\n=== FULL FORWARD PASS SUCCESS ===")
# ============================================================
# DONE
# ============================================================

print("\n=== EVERYTHING PASSED ===")