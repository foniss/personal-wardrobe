import torch
import torch_directml

from fashn_vton.tryon_mmdit import TryOnModel
from fashn_vton.utils import load_checkpoint

d = torch_directml.device()

print("PyTorch:", torch.__version__)
print("DirectML:", d)

print("\nLoading checkpoint...")
sd = load_checkpoint(r".\weights\model.safetensors", device="cpu")
print("Checkpoint tensors:", len(sd))

print("\nCreating model...")
model = TryOnModel()
model.load_state_dict(sd)
del sd
model.to(d).eval()

print("Model device:", next(model.parameters()).device)

# Correct channel counts:
# x = 3
# ca = 3
# person pose = 1
# garment = 3
# garment pose = 1

print("\nCreating tensors...")

x = torch.randn(1, 3, 864, 576, device=d)
ca = torch.randn(1, 3, 864, 576, device=d)
garment = torch.randn(1, 3, 864, 576, device=d)
pp = torch.randn(1, 1, 864, 576, device=d)
gp = torch.randn(1, 1, 864, 576, device=d)

times = torch.tensor([0.5], device=d)
cats = torch.tensor([1], dtype=torch.long, device=d)

print("Inputs ready")

with torch.no_grad():

    print("\n[1] Concatenating person inputs...")
    person = torch.cat([x, ca, pp], dim=1)
    print("person:", person.shape, person.device)

    print("\n[2] x_embedder...")
    img = model.x_embedder(person)
    print("embedded:", img.shape, img.device)

    print("\n[3] prepare...")
    from fashn_vton.tryon_mmdit import prepare

    img, x_ids = prepare(img)
    print("img:", img.shape, img.device)
    print("x_ids:", x_ids.shape, x_ids.device)

    print("\n[4] garment inputs...")
    g = torch.cat([garment, gp], dim=1)
    print("garment:", g.shape, g.device)

    print("\n[5] garment_embedder...")
    g = model.garment_embedder(g)
    print("garment embedded:", g.shape, g.device)

    print("\n[6] garment prepare...")
    g, g_ids = prepare(g)
    print("g:", g.shape, g.device)
    print("g_ids:", g_ids.shape, g_ids.device)

    print("\n[7] timestep embedding...")
    t = model.t_embedder(times)
    print("t:", t.shape, t.device)

    print("\n[8] category embedding...")
    y = model.y_embedder(cats)
    print("y:", y.shape, y.device)

    t = t + y
    print("combined t:", t.shape, t.device)

    print("\n[9] x positional embedding...")
    x_pe = model.pe_embedder(x_ids)
    print("x_pe:", x_pe.shape, x_pe.device)

    print("\n[10] garment positional embedding...")
    g_pe = model.pe_embedder(g_ids)
    print("g_pe:", g_pe.shape, g_pe.device)

    print("\n[11] concatenate positional embeddings...")
    pe = torch.cat([x_pe, g_pe], dim=2)
    print("pe:", pe.shape, pe.device)

    print("\n[12] PATCH MIXER...")
    for i, block in enumerate(model.x_patch_mixer):
        print(f"  Block {i + 1}/4...")
        img = block(img, vec=t, pe=x_pe)
        print("  output:", img.shape, img.device)

    print("\nPATCH MIXER SUCCESS")

print("\n=== EVERYTHING PASSED ===")