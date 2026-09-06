"""
TryOn Model.

Contains components adapted from FLUX.1 by Black Forest Labs (Apache-2.0):
https://github.com/black-forest-labs/flux

DirectML compatibility modifications:
- RoPE no longer creates rank-6 [B, 1, L, D/2, 2, 2] tensors.
- RoPE is represented as [B, L, D/2, 2] where the last dimension is
  [cos, sin].
- apply_rope performs the rotation directly using even/odd channels.
- DoubleStreamBlock performs attention exactly once.
"""

import math
from dataclasses import dataclass
from typing import Optional, Tuple

import torch
from einops import rearrange, repeat
from torch import Tensor, nn

from .utils import cast_tuple, compact, exists, unpack_images


# ============================================================================
# ATTENTION
# ============================================================================

def _attn_processor(
    q: Tensor,
    k: Tensor,
    v: Tensor,
    chunk_size: int = 3456,
) -> Tensor:
    """
    Memory-efficient scaled dot-product attention.

    DirectML may attempt to materialize the complete
    attention matrix:

        [B, H, L, L]

    which is enormous for the 6912-token MMDiT sequence.

    Process the query sequence in chunks instead.
    """

    batch_size, num_heads, seq_len, head_dim = q.shape

    # NOTE: a preallocated-output-tensor version of this loop
    # (writing each chunk into out[:, :, start:end, :] in place)
    # was tried and produced silently corrupted attention output on
    # torch-directml (pale/noisy images), even though it is
    # numerically equivalent on CPU/CUDA. Do not reintroduce in-place
    # sliced writes into GPU tensors here without independently
    # verifying output equivalence on the target hardware. The
    # list + torch.cat form below is the confirmed-safe version.
    outputs = []

    for start in range(0, seq_len, chunk_size):

        end = min(
            start + chunk_size,
            seq_len,
        )

        q_chunk = q[:, :, start:end, :]

        out_chunk = torch.nn.functional.scaled_dot_product_attention(
            q_chunk,
            k,
            v,
        )

        outputs.append(out_chunk)

    if len(outputs) == 1:
        return outputs[0]
    return torch.cat(outputs, dim=2)

def attention(
    q: Tensor,
    k: Tensor,
    v: Tensor,
    pe: Tensor,
) -> Tensor:
    """
    Apply RoPE and then scaled dot product attention.

    The output is converted from:
        [B, H, L, D]

    to:
        [B, L, H*D]
    """

    q, k = apply_rope(q, k, pe)

    x = _attn_processor(q, k, v)

    x = rearrange(
        x,
        "B H L D -> B L (H D)",
    )

    return x


# ============================================================================
# DIRECTML-SAFE ROTARY POSITION EMBEDDINGS
# ============================================================================

def rope(
    pos: Tensor,
    dim: int,
    theta: int,
) -> Tensor:
    """
    Create DirectML-safe rotary positional embeddings.

    Original FLUX implementation produces:

        [B, L, dim/2, 2, 2]

    and then EmbedND adds another dimension, producing rank 6:

        [B, 1, L, dim/2, 2, 2]

    DirectML rejects tensors above rank 5 in this path.

    We instead return:

        [B, L, dim/2, 2]

    where:
        [..., 0] = cos
        [..., 1] = sin

    This contains exactly the same rotation information.
    """

    assert dim % 2 == 0

    scale = (
        torch.arange(
            0,
            dim,
            2,
            dtype=torch.float32,
            device=pos.device,
        )
        / dim
    )

    omega = 1.0 / (theta ** scale)

    # [B, L] -> [B, L, dim/2]
    angles = torch.einsum(
        "...n,d->...nd",
        pos,
        omega,
    )

    cos = torch.cos(angles)
    sin = torch.sin(angles)

    # [B, L, dim/2, 2]
    return torch.stack(
        [cos, sin],
        dim=-1,
    ).float()


def apply_rope(
    xq: Tensor,
    xk: Tensor,
    freqs_cis: Tensor,
) -> tuple[Tensor, Tensor]:
    """
    Apply rotary positional embeddings.

    DirectML-compatible implementation.

    xq/xk:
        [B, H, L, D]

    freqs_cis:
        [B, L, D/2, 2]

    The final dimension contains:
        [..., 0] = cos
        [..., 1] = sin
    """

    # xq/xk are [B, H, L, D]
    #
    # Convert every pair of head dimensions into:
    #
    # [even, odd]
    #
    # resulting shape:
    #
    # [B, H, L, D/2]

    q_even = xq[..., 0::2]
    q_odd = xq[..., 1::2]

    k_even = xk[..., 0::2]
    k_odd = xk[..., 1::2]

    # freqs_cis:
    #
    # [B, L, D/2, 2]
    #
    # Add the head dimension so it broadcasts against
    # [B, H, L, D/2].
    cos = freqs_cis[..., 0].unsqueeze(1)
    sin = freqs_cis[..., 1].unsqueeze(1)

    # Rotary transformation.
    q_even_out = q_even * cos - q_odd * sin
    q_odd_out = q_even * sin + q_odd * cos

    k_even_out = k_even * cos - k_odd * sin
    k_odd_out = k_even * sin + k_odd * cos

    # Interleave even/odd dimensions back together.
    q_out = torch.stack(
        [q_even_out, q_odd_out],
        dim=-1,
    ).flatten(-2)

    k_out = torch.stack(
        [k_even_out, k_odd_out],
        dim=-1,
    ).flatten(-2)

    return (
        q_out.type_as(xq),
        k_out.type_as(xk),
    )

class EmbedND(nn.Module):
    """
    Multi-axis rotary embedding.

    IMPORTANT:
    This DirectML-safe implementation returns:

        [B, L, D/2, 2]

    instead of the original:

        [B, 1, L, D/2, 2, 2]

    The latter is rank 6 and causes DirectML to crash.
    """

    def __init__(
        self,
        dim: int,
        theta: int,
        axes_dim: list[int],
    ):
        super().__init__()

        self.dim = dim
        self.theta = theta
        self.axes_dim = axes_dim

    def forward(
        self,
        ids: Tensor,
    ) -> Tensor:
        n_axes = ids.shape[-1]

        embeddings = [
            rope(
                ids[..., i],
                self.axes_dim[i],
                self.theta,
            )
            for i in range(n_axes)
        ]

        # Each element:
        #
        # [B, L, axis_dim/2, 2]
        #
        # Concatenate the frequency dimensions:
        #
        # [B, L, total_dim/2, 2]
        return torch.cat(
            embeddings,
            dim=-2,
        )


# ============================================================================
# NORMALIZATION
# ============================================================================

class RMSNorm(torch.nn.Module):

    def __init__(
        self,
        dim: int,
    ):
        super().__init__()

        self.scale = nn.Parameter(
            torch.ones(dim)
        )

    def forward(
        self,
        x: Tensor,
    ):
        x_dtype = x.dtype

        x = x.float()

        rrms = torch.rsqrt(
            torch.mean(
                x ** 2,
                dim=-1,
                keepdim=True,
            )
            + 1e-6
        )

        return (
            x * rrms
        ).to(
            dtype=x_dtype
        ) * self.scale


class QKNorm(torch.nn.Module):

    def __init__(
        self,
        dim: int,
    ):
        super().__init__()

        self.query_norm = RMSNorm(dim)
        self.key_norm = RMSNorm(dim)

    def forward(
        self,
        q: Tensor,
        k: Tensor,
        v: Tensor,
    ) -> tuple[Tensor, Tensor]:

        q = self.query_norm(q)
        k = self.key_norm(k)

        return q.to(v), k.to(v)


# ============================================================================
# SELF ATTENTION
# ============================================================================

class SelfAttention(nn.Module):

    def __init__(
        self,
        dim: int,
        num_heads: int = 8,
        qkv_bias: bool = False,
    ):
        super().__init__()

        self.num_heads = num_heads

        head_dim = dim // num_heads

        self.qkv = nn.Linear(
            dim,
            dim * 3,
            bias=qkv_bias,
        )

        self.norm = QKNorm(head_dim)

        self.proj = nn.Linear(
            dim,
            dim,
        )

    def forward(
        self,
        x: Tensor,
        pe: Tensor,
    ) -> Tensor:

        qkv = self.qkv(x)

        q, k, v = rearrange(
            qkv,
            "B L (K H D) -> K B H L D",
            K=3,
            H=self.num_heads,
        )

        q, k = self.norm(
            q,
            k,
            v,
        )

        x = attention(
            q,
            k,
            v,
            pe=pe,
        )

        x = self.proj(x)

        return x


# ============================================================================
# MODULATION
# ============================================================================

@dataclass
class ModulationOut:
    shift: Tensor
    scale: Tensor
    gate: Tensor


class Modulation(nn.Module):

    def __init__(
        self,
        dim: int,
        double: bool,
    ):
        super().__init__()

        self.is_double = double

        self.multiplier = (
            6
            if double
            else 3
        )

        self.lin = nn.Linear(
            dim,
            self.multiplier * dim,
            bias=True,
        )

    def forward(
        self,
        vec: Tensor,
    ) -> tuple[
        ModulationOut,
        ModulationOut | None,
    ]:

        out = self.lin(
            nn.functional.silu(vec)
        )[:, None, :].chunk(
            self.multiplier,
            dim=-1,
        )

        return (
            ModulationOut(
                *out[:3]
            ),
            ModulationOut(
                *out[3:]
            )
            if self.is_double
            else None,
        )


# ============================================================================
# DOUBLE STREAM BLOCK
# ============================================================================

class DoubleStreamBlock(nn.Module):

    def __init__(
        self,
        hidden_size: int,
        num_heads: int,
        mlp_ratio: float,
        qkv_bias: bool = False,
    ):
        super().__init__()

        mlp_hidden_dim = int(
            hidden_size * mlp_ratio
        )

        self.num_heads = num_heads
        self.hidden_size = hidden_size

        # ------------------------------------------------------------------
        # IMAGE STREAM
        # ------------------------------------------------------------------

        self.img_mod = Modulation(
            hidden_size,
            double=True,
        )

        self.img_norm1 = nn.LayerNorm(
            hidden_size,
            elementwise_affine=False,
            eps=1e-6,
        )

        self.img_attn = SelfAttention(
            dim=hidden_size,
            num_heads=num_heads,
            qkv_bias=qkv_bias,
        )

        self.img_norm2 = nn.LayerNorm(
            hidden_size,
            elementwise_affine=False,
            eps=1e-6,
        )

        self.img_mlp = nn.Sequential(
            nn.Linear(
                hidden_size,
                mlp_hidden_dim,
                bias=True,
            ),
            nn.GELU(
                approximate="tanh"
            ),
            nn.Linear(
                mlp_hidden_dim,
                hidden_size,
                bias=True,
            ),
        )

        # ------------------------------------------------------------------
        # TEXT / GARMENT STREAM
        # ------------------------------------------------------------------

        self.txt_mod = Modulation(
            hidden_size,
            double=True,
        )

        self.txt_norm1 = nn.LayerNorm(
            hidden_size,
            elementwise_affine=False,
            eps=1e-6,
        )

        self.txt_attn = SelfAttention(
            dim=hidden_size,
            num_heads=num_heads,
            qkv_bias=qkv_bias,
        )

        self.txt_norm2 = nn.LayerNorm(
            hidden_size,
            elementwise_affine=False,
            eps=1e-6,
        )

        self.txt_mlp = nn.Sequential(
            nn.Linear(
                hidden_size,
                mlp_hidden_dim,
                bias=True,
            ),
            nn.GELU(
                approximate="tanh"
            ),
            nn.Linear(
                mlp_hidden_dim,
                hidden_size,
                bias=True,
            ),
        )

    def forward(
        self,
        img: Tensor,
        txt: Tensor,
        vec: Tensor,
        pe: Tensor,
    ) -> tuple[Tensor, Tensor]:

        img_mod1, img_mod2 = self.img_mod(vec)
        txt_mod1, txt_mod2 = self.txt_mod(vec)

        # ------------------------------------------------------------------
        # IMAGE QKV
        # ------------------------------------------------------------------

        img_modulated = self.img_norm1(img)

        img_modulated = (
            (1 + img_mod1.scale)
            * img_modulated
            + img_mod1.shift
        )

        img_qkv = self.img_attn.qkv(
            img_modulated
        )

        img_q, img_k, img_v = rearrange(
            img_qkv,
            "B L (K H D) -> K B H L D",
            K=3,
            H=self.num_heads,
        )

        img_q, img_k = self.img_attn.norm(
            img_q,
            img_k,
            img_v,
        )

        # ------------------------------------------------------------------
        # TEXT / GARMENT QKV
        # ------------------------------------------------------------------

        txt_modulated = self.txt_norm1(txt)

        txt_modulated = (
            (1 + txt_mod1.scale)
            * txt_modulated
            + txt_mod1.shift
        )

        txt_qkv = self.txt_attn.qkv(
            txt_modulated
        )

        txt_q, txt_k, txt_v = rearrange(
            txt_qkv,
            "B L (K H D) -> K B H L D",
            K=3,
            H=self.num_heads,
        )

        txt_q, txt_k = self.txt_attn.norm(
            txt_q,
            txt_k,
            txt_v,
        )

        # ------------------------------------------------------------------
        # APPLY ROPE SEPARATELY
        #
        # pe:
        # [B, L_total, D/2, 2]
        #
        # No rank-6 tensor is created.
        # ------------------------------------------------------------------

        # Apply RoPE separately to garment/text and image streams.
        # This avoids creating the old rank-6 PE tensor that DirectML cannot handle.

        # Combine the two streams for joint attention first, then apply RoPE once.
        q = torch.cat((txt_q, img_q), dim=2)
        k = torch.cat((txt_k, img_k), dim=2)
        v = torch.cat((txt_v, img_v), dim=2)

        q, k = apply_rope(q, k, pe)

        # Run attention ONCE.
        attn = _attn_processor(q, k, v)

        attn = rearrange(
            attn,
            "B H L D -> B L (H D)",
        )

        txt_attn = attn[:, :txt.shape[1]]
        img_attn = attn[:, txt.shape[1]:]

        # ------------------------------------------------------------------
        # IMAGE BLOCK
        # ------------------------------------------------------------------

        img = (
            img
            + img_mod1.gate
            * self.img_attn.proj(img_attn)
        )

        img = (
            img
            + img_mod2.gate
            * self.img_mlp(
                (1 + img_mod2.scale)
                * self.img_norm2(img)
                + img_mod2.shift
            )
        )

        # ------------------------------------------------------------------
        # TEXT BLOCK
        # ------------------------------------------------------------------

        txt = (
            txt
            + txt_mod1.gate
            * self.txt_attn.proj(txt_attn)
        )

        txt = (
            txt
            + txt_mod2.gate
            * self.txt_mlp(
                (1 + txt_mod2.scale)
                * self.txt_norm2(txt)
                + txt_mod2.shift
            )
        )

        return img, txt


# ============================================================================
# SINGLE STREAM BLOCK
# ============================================================================

class SingleStreamBlock(nn.Module):
    """
    A DiT block with parallel linear layers as described in:

    https://arxiv.org/abs/2302.05442

    and adapted modulation interface.
    """

    def __init__(
        self,
        hidden_size: int,
        num_heads: int,
        mlp_ratio: float = 4.0,
    ):
        super().__init__()

        self.num_heads = num_heads

        head_dim = hidden_size // num_heads

        self.mlp_hidden_dim = int(
            hidden_size * mlp_ratio
        )

        # qkv and mlp input

        self.linear1 = nn.Linear(
            hidden_size,
            hidden_size * 3
            + self.mlp_hidden_dim,
        )

        # projection and mlp output

        self.linear2 = nn.Linear(
            hidden_size
            + self.mlp_hidden_dim,
            hidden_size,
        )

        self.norm = QKNorm(
            head_dim
        )

        self.hidden_size = hidden_size

        self.pre_norm = nn.LayerNorm(
            hidden_size,
            elementwise_affine=False,
            eps=1e-6,
        )

        self.mlp_act = nn.GELU(
            approximate="tanh"
        )

        self.modulation = Modulation(
            hidden_size,
            double=False,
        )

    def forward(
        self,
        x: Tensor,
        vec: Tensor,
        pe: Tensor,
    ) -> Tensor:

        mod, _ = self.modulation(vec)

        x_mod = (
            (1 + mod.scale)
            * self.pre_norm(x)
            + mod.shift
        )

        qkv, mlp = torch.split(
            self.linear1(x_mod),
            [
                3 * self.hidden_size,
                self.mlp_hidden_dim,
            ],
            dim=-1,
        )

        q, k, v = rearrange(
            qkv,
            "B L (K H D) -> K B H L D",
            K=3,
            H=self.num_heads,
        )

        q, k = self.norm(
            q,
            k,
            v,
        )

        # Attention with DirectML-safe RoPE.

        attn = attention(
            q,
            k,
            v,
            pe=pe,
        )

        # MLP stream.

        mlp_out = self.mlp_act(
            mlp
        )

        output = self.linear2(
            torch.cat(
                (
                    attn,
                    mlp_out,
                ),
                dim=2,
            )
        )

        return (
            x
            + mod.gate * output
        )


# ============================================================================
# FINAL LAYER
# ============================================================================

class LastLayer(nn.Module):

    def __init__(
        self,
        hidden_size: int,
        out_channels: int,
    ):
        super().__init__()

        self.norm_final = nn.LayerNorm(
            hidden_size,
            elementwise_affine=False,
            eps=1e-6,
        )

        self.linear = nn.Linear(
            hidden_size,
            out_channels,
            bias=True,
        )

        self.adaLN_modulation = nn.Sequential(
            nn.SiLU(),
            nn.Linear(
                hidden_size,
                2 * hidden_size,
                bias=True,
            ),
        )

    def forward(
        self,
        x: Tensor,
        vec: Tensor,
    ) -> Tensor:

        shift, scale = (
            self.adaLN_modulation(vec)
            .chunk(
                2,
                dim=1,
            )
        )

        x = (
            (1 + scale[:, None, :])
            * self.norm_final(x)
            + shift[:, None, :]
        )

        x = self.linear(x)

        return x


# ============================================================================
# IMAGE PREPARATION
# ============================================================================

def prepare(
    img: Tensor,
    patch_size: int = 1,
) -> dict[str, Tensor]:

    bs, c, h, w = img.shape

    # Rearrange image into patches.

    img = rearrange(
        img,
        "b c (h ph) (w pw) -> b (h w) (c ph pw)",
        ph=patch_size,
        pw=patch_size,
    )

    # Ensure all images in batch are processed.

    if img.shape[0] == 1 and bs > 1:
        img = repeat(
            img,
            "1 ... -> bs ...",
            bs=bs,
        )

    # Create image IDs.

    img_ids = torch.zeros(
        h // patch_size,
        w // patch_size,
        3,
    )

    img_ids[..., 1] = (
        img_ids[..., 1]
        + torch.arange(
            h // patch_size
        )[:, None]
    )

    img_ids[..., 2] = (
        img_ids[..., 2]
        + torch.arange(
            w // patch_size
        )[None, :]
    )

    img_ids = repeat(
        img_ids,
        "h w c -> b (h w) c",
        b=bs,
    )

    return (
        img,
        img_ids.to(img.device),
    )


# ============================================================================
# PATCH EMBEDDING
# ============================================================================

class PatchEmbed(nn.Module):
    """
    2D Image to Patch Embedding.
    """

    def __init__(
        self,
        img_size=224,
        patch_size=16,
        in_chans=3,
        embed_dim=768,
        norm_layer=None,
        flatten=True,
        bias=True,
    ):
        super().__init__()

        img_size = cast_tuple(
            img_size,
            2,
        )

        patch_size = cast_tuple(
            patch_size,
            2,
        )

        self.img_size = img_size

        self.patch_size = patch_size

        self.grid_size = (
            img_size[0] // patch_size[0],
            img_size[1] // patch_size[1],
        )

        self.num_patches = (
            self.grid_size[0]
            * self.grid_size[1]
        )

        self.flatten = flatten

        self.proj = nn.Conv2d(
            in_chans,
            embed_dim,
            kernel_size=patch_size,
            stride=patch_size,
            bias=bias,
        )

        self.norm = (
            norm_layer(embed_dim)
            if exists(norm_layer)
            else nn.Identity()
        )

        # Initialize patch embed like nn.Linear.

        w = self.proj.weight.data

        nn.init.xavier_uniform_(
            w.view(
                [w.shape[0], -1]
            )
        )

        nn.init.constant_(
            self.proj.bias,
            0,
        )

    def forward(
        self,
        x,
    ):

        x = self.proj(x)

        if self.flatten:
            x = (
                x.flatten(2)
                .transpose(1, 2)
            )

        x = self.norm(x)

        return x


# ============================================================================
# MLP EMBEDDER
# ============================================================================

class MLPEmbedder(nn.Module):

    def __init__(
        self,
        in_dim: int,
        hidden_dim: int,
    ):
        super().__init__()

        self.in_layer = nn.Linear(
            in_dim,
            hidden_dim,
            bias=True,
        )

        self.silu = nn.SiLU()

        self.out_layer = nn.Linear(
            hidden_dim,
            hidden_dim,
            bias=True,
        )

    def forward(
        self,
        x: Tensor,
    ) -> Tensor:

        return self.out_layer(
            self.silu(
                self.in_layer(x)
            )
        )


# ============================================================================
# TIMESTEP EMBEDDING
# ============================================================================

def timestep_embedding(
    t: Tensor,
    dim,
    max_period=10000,
    time_factor: float = 1000.0,
):
    """
    Create sinusoidal timestep embeddings.

    :param t:
        A 1-D Tensor of N indices, one per batch element.

    :param dim:
        Dimension of output.

    :param max_period:
        Controls minimum frequency.
    """

    t = time_factor * t

    half = dim // 2

    freqs = torch.exp(
        -math.log(max_period)
        * torch.arange(
            start=0,
            end=half,
            dtype=torch.float32,
        )
        / half
    ).to(t.device)

    args = (
        t[:, None].float()
        * freqs[None]
    )

    embedding = torch.cat(
        [
            torch.cos(args),
            torch.sin(args),
        ],
        dim=-1,
    )

    if dim % 2:
        embedding = torch.cat(
            [
                embedding,
                torch.zeros_like(
                    embedding[:, :1]
                ),
            ],
            dim=-1,
        )

    if torch.is_floating_point(t):
        embedding = embedding.to(t)

    return embedding


class TimestepEmbedder(nn.Module):

    def __init__(
        self,
        hidden_size,
        frequency_embedding_size=256,
    ):
        super().__init__()

        self.mlp = MLPEmbedder(
            frequency_embedding_size,
            hidden_size,
        )

        self.frequency_embedding_size = (
            frequency_embedding_size
        )

    def forward(
        self,
        t: Tensor,
    ) -> Tensor:

        return self.mlp(
            timestep_embedding(
                t,
                self.frequency_embedding_size,
            )
        )


# ============================================================================
# CONDITIONAL DROPOUT
# ============================================================================

def apply_conditional_dropout(
    tensor,
    mask,
    null_tensor=None,
):

    device = tensor.device
    dtype = tensor.dtype

    mask_shape = (
        [mask.shape[0]]
        + [1] * (tensor.dim() - 1)
    )

    keep_mask = mask.view(
        *mask_shape
    )

    if exists(null_tensor):

        null_tensor = null_tensor.to(
            device=device,
            dtype=dtype,
        )

        null_tensor = null_tensor.expand_as(
            tensor
        )

    else:

        null_tensor = torch.zeros_like(
            tensor
        )

    return torch.where(
        keep_mask,
        tensor,
        null_tensor,
    )


# ============================================================================
# TRY-ON MODEL
# ============================================================================

class TryOnModel(nn.Module):

    def __init__(
        self,
        input_shape: Tuple[int] = (792, 528),
        hidden_size: int = 1280,
        n_heads=10,
        double_blocks_depth: int = 8,
        single_blocks_depth: int = 16,
        mlp_ratio: int = 4,
        channels_in: int = 3,
        patch_size: int = 12,
        theta: int = 10000,
        axes_dim: Tuple[int] = (16, 56, 56),
        qkv_bias: bool = True,
        guidance_embed: bool = False,
        n_classes: int = 3,
        use_patch_mixer: bool = True,
        patch_mixer_depth: int = 4,
    ):
        super().__init__()

        # ------------------------------------------------------------------
        # TIME
        # ------------------------------------------------------------------

        self.t_embedder = TimestepEmbedder(
            hidden_size=hidden_size
        )

        # ------------------------------------------------------------------
        # CATEGORY LABELS
        # tops, bottoms, one-pieces
        # ------------------------------------------------------------------

        self.y_embedder = (
            nn.Embedding(
                n_classes + 1,
                hidden_size,
            )
            if n_classes > 0
            else None
        )

        # ------------------------------------------------------------------
        # GUIDANCE EMBEDDING
        # ------------------------------------------------------------------

        self.guidance_embedder = (
            TimestepEmbedder(
                hidden_size=hidden_size
            )
            if guidance_embed
            else None
        )

        # ------------------------------------------------------------------
        # POSITIONAL EMBEDDINGS
        # ------------------------------------------------------------------

        pe_dim = (
            hidden_size // n_heads
        )

        if sum(axes_dim) != pe_dim:
            raise ValueError(
                f"Got {axes_dim} but expected positional dim {pe_dim}"
            )

        self.pe_embedder = EmbedND(
            dim=pe_dim,
            theta=theta,
            axes_dim=list(axes_dim),
        )

        # ------------------------------------------------------------------
        # IMAGE CONFIG
        # ------------------------------------------------------------------

        self.input_shape = input_shape
        self.patch_size = patch_size
        self.channels_in = channels_in

        # ------------------------------------------------------------------
        # PERSON IMAGE EMBEDDER
        # ------------------------------------------------------------------

        self.x_embedder = PatchEmbed(
            img_size=input_shape,
            patch_size=patch_size,
            in_chans=channels_in * 2 + 1,
            embed_dim=hidden_size,
            flatten=False,
        )

        # ------------------------------------------------------------------
        # GARMENT IMAGE EMBEDDER
        # ------------------------------------------------------------------

        self.garment_embedder = PatchEmbed(
            img_size=input_shape,
            patch_size=patch_size,
            in_chans=channels_in + 1,
            embed_dim=hidden_size,
            flatten=False,
        )

        # ------------------------------------------------------------------
        # PATCH MIXER
        # ------------------------------------------------------------------

        self.use_patch_mixer = use_patch_mixer

        if use_patch_mixer:

            self.x_patch_mixer = nn.ModuleList(
                [
                    SingleStreamBlock(
                        hidden_size,
                        n_heads,
                        mlp_ratio=mlp_ratio,
                    )
                    for _ in range(
                        patch_mixer_depth
                    )
                ]
            )

            # Buffer kept for checkpoint compatibility.

            self.register_buffer(
                "patch_mixer_token",
                torch.zeros(
                    1,
                    1,
                    channels_in
                    * self.patch_size ** 2,
                ),
            )

        # ------------------------------------------------------------------
        # CORE MMDiT
        # ------------------------------------------------------------------

        self.double_blocks = nn.ModuleList(
            [
                DoubleStreamBlock(
                    hidden_size,
                    n_heads,
                    mlp_ratio=mlp_ratio,
                    qkv_bias=qkv_bias,
                )
                for _ in range(
                    double_blocks_depth
                )
            ]
        )

        self.single_blocks = nn.ModuleList(
            [
                SingleStreamBlock(
                    hidden_size,
                    n_heads,
                    mlp_ratio=mlp_ratio,
                )
                for _ in range(
                    single_blocks_depth
                )
            ]
        )

        # ------------------------------------------------------------------
        # FINAL LAYER
        # ------------------------------------------------------------------

        self.final_layer = LastLayer(
            hidden_size,
            out_channels=(
                channels_in
                * self.patch_size ** 2
            ),
        )

        # Static embedding caches
        self._cached_pe = None
        self._cached_x_pe = None
        self._cached_garment_key = None
        self._cached_garment_cond = None
        self._cached_garment_uncond = None

    # ======================================================================
    # CLASSIFIER FREE GUIDANCE
    # ======================================================================

    def forward_for_cfg(
        self,
        *args,
        compute_uncond: bool = True,
        **kwargs,
    ):

        # Cleanup kwargs.

        kwargs = compact(kwargs)

        # Infer batch size.

        noisy_images = args[0]

        batch_size = (
            noisy_images.shape[0]
        )

        # ------------------------------------------------------------------
        # DIRECTML VRAM FIX
        #
        # The original implementation concatenated every conditioning
        # tensor (and the noisy image) into a batch of size 2*B and ran a
        # single forward pass, so peak activation memory through every
        # double-stream / patch-mixer / single-stream block scaled with
        # 2*B. On an 8GB card this concatenated forward pass is the
        # single largest VRAM consumer during sampling. It also rebuilt
        # those 2*B-sized tensors from scratch on every one of the
        # num_timesteps sampling steps, which churns DirectML's allocator
        # (no CUDA-style caching allocator / empty_cache() exists for
        # DirectML today) and encourages fragmentation.
        #
        # Every normalization and attention op in this model treats the
        # batch dimension independently (LayerNorm here has
        # elementwise_affine=False and normalizes per-token/per-sample,
        # RMSNorm is per-sample, and scaled_dot_product_attention never
        # mixes across the batch dim), so running the conditional and
        # unconditional passes sequentially at the *original* batch size
        # B is numerically equivalent to the batched version. This
        # roughly halves peak activation memory and removes the
        # per-step duplication copies entirely, at the cost of two
        # sequential forward calls instead of one batched call (sampling
        # already computes one v_c/v_u pair per step either way).
        # ------------------------------------------------------------------

        # ------------------------------------------------------------------
        # PRECOMPUTE STATIC GARMENT TOKENS (cached across steps)
        # ------------------------------------------------------------------
        garment_images = kwargs.get("garment_images")
        garment_poses = kwargs.get("garment_poses")
        garment_cond = None
        garment_uncond = None

        if garment_images is not None and garment_poses is not None:
            cache_key = (id(garment_images), id(garment_poses), batch_size, noisy_images.device)
            if self._cached_garment_key == cache_key:
                garment_cond = self._cached_garment_cond
                garment_uncond = self._cached_garment_uncond
            else:
                # Precompute conditional garment tokens
                g_cond = torch.cat([garment_images, garment_poses], dim=1)
                g_cond = self.garment_embedder(g_cond)
                garment_cond, _ = prepare(g_cond)

                # Precompute unconditional garment tokens (all zeros)
                g_uncond = torch.zeros_like(torch.cat([garment_images, garment_poses], dim=1))
                g_uncond = self.garment_embedder(g_uncond)
                garment_uncond, _ = prepare(g_uncond)

                self._cached_garment_key = cache_key
                self._cached_garment_cond = garment_cond
                self._cached_garment_uncond = garment_uncond

        # ------------------------------------------------------------------
        # PRECOMPUTE TIMESTEP + CATEGORY VEC (shared across cond/uncond)
        #
        # The cond and uncond passes differ only in the conditioning tokens;
        # the timestep and category embeddings are identical for both.  We
        # compute them once in forward_for_cfg and inject via precomputed_vec
        # so that forward() skips t_embedder / y_embedder on the uncond call.
        # ------------------------------------------------------------------
        times = args[1] if len(args) > 1 else kwargs.get("times")
        garment_categories = kwargs.get("garment_categories")
        precomputed_vec = None

        if times is not None:
            precomputed_vec = self.t_embedder(times)
            if exists(self.guidance_embedder):
                guidance = kwargs.get("guidance")
                if exists(guidance):
                    precomputed_vec = precomputed_vec + self.guidance_embedder(guidance)
            if exists(self.y_embedder) and exists(garment_categories):
                # For cond pass the mask is all-True so y is unchanged;
                # for uncond pass the mask zeros it.  The null class index
                # is n_classes (the extra embedding row added in __init__).
                # We use the cond y here (same as mask=all-True path).
                precomputed_vec = precomputed_vec + self.y_embedder(garment_categories)

        cond_mask = torch.ones(
            batch_size,
            device=noisy_images.device,
            dtype=torch.bool,
        )

        logits = self.forward(
            *args,
            **kwargs,
            mask=cond_mask,
            precomputed_garment=garment_cond,
            precomputed_vec=precomputed_vec,
        )["x"]

        # The caller (the sampling loop) knows in advance whether v_u
        # will actually be used to form v_guided this step (it isn't,
        # during skip_cfg_last_n_steps). Skipping the unconditional
        # forward pass there avoids a full transformer forward pass
        # (and its CPU final-layer roundtrip) whose result would just
        # be thrown away.
        if not compute_uncond:
            return {
                "v_c": logits,
                "v_u": None,
            }

        uncond_mask = torch.zeros(
            batch_size,
            device=noisy_images.device,
            dtype=torch.bool,
        )

        # For the uncond vec: the original code called apply_conditional_dropout
        # on garment_categories with mask=all-False, which zeroes the integer
        # tensor to produce category index 0 for every sample.  Replicate that
        # here by embedding zeros (index 0) instead of the real category.
        if exists(self.y_embedder) and exists(garment_categories) and precomputed_vec is not None:
            uncond_vec = self.t_embedder(times)
            if exists(self.guidance_embedder):
                guidance = kwargs.get("guidance")
                if exists(guidance):
                    uncond_vec = uncond_vec + self.guidance_embedder(guidance)
            # Original uncond: apply_conditional_dropout zeros the category
            # tensor → index 0 for all samples.
            null_y = torch.zeros_like(garment_categories)
            uncond_vec = uncond_vec + self.y_embedder(null_y)
        else:
            uncond_vec = precomputed_vec

        null_logits = self.forward(
            *args,
            **kwargs,
            mask=uncond_mask,
            precomputed_garment=garment_uncond,
            precomputed_vec=uncond_vec,
        )["x"]

        return {
            "v_c": logits,
            "v_u": null_logits,
        }

    # ======================================================================
    # FORWARD
    # ======================================================================

    def forward(
        self,
        x,
        times,
        ca_images,
        garment_images,
        person_poses,
        garment_poses,
        mask: Optional[torch.Tensor] = None,
        guidance: Optional[torch.Tensor] = None,
        garment_categories: Optional[torch.Tensor] = None,
        precomputed_garment: Optional[torch.Tensor] = None,
        precomputed_vec: Optional[torch.Tensor] = None,
    ):

        # ==================================================================
        # CLASSIFIER FREE GUIDANCE
        # ==================================================================

        batch_size = x.shape[0]
        device = x.device

        if not exists(mask):
            mask = torch.ones(
                batch_size,
                device=device,
                dtype=torch.bool,
            )

        # ==================================================================
        # 2D IMAGES -> SEQUENCES
        # ==================================================================

        # Person conditioning.

        ca_images = apply_conditional_dropout(
            ca_images,
            mask,
        )

        person_poses = apply_conditional_dropout(
            person_poses,
            mask,
        )

        x = torch.cat(
            [
                x,
                ca_images,
                person_poses,
            ],
            dim=1,
        )

        x = self.x_embedder(x)

        x, x_ids = prepare(x)

        # Garment conditioning.

        if precomputed_garment is not None:
            garment_images = precomputed_garment
        else:
            garment_poses = apply_conditional_dropout(
                garment_poses,
                mask,
            )

            garment_images = apply_conditional_dropout(
                garment_images,
                mask,
            )

            garment_images = torch.cat(
                [
                    garment_images,
                    garment_poses,
                ],
                dim=1,
            )

            garment_images = self.garment_embedder(
                garment_images
            )

            garment_images, _ = prepare(
                garment_images
            )

        # ==================================================================
        # TIME & MODULATION
        # ==================================================================

        if precomputed_vec is not None:
            # Caller (forward_for_cfg) already computed t_embedder + y_embedder
            # for this pass; reuse it to avoid redundant embedding lookups.
            t = precomputed_vec
        else:
            t = self.t_embedder(times)

            if exists(self.guidance_embedder):

                assert exists(guidance), (
                    "Guidance scale required for guidance distilled model"
                )

                t = (
                    t
                    + self.guidance_embedder(
                        guidance
                    )
                )

            if exists(self.y_embedder):

                assert exists(
                    garment_categories
                ), (
                    "Category labels required for y_embedder"
                )

                y = apply_conditional_dropout(
                    garment_categories,
                    mask,
                )

                t = (
                    t
                    + self.y_embedder(y)
                )

        # ==================================================================
        # POSITIONAL EMBEDDINGS
        # ==================================================================

        img = x
        txt = garment_images
        vec = t

        # Check cached positional embeddings
        if (
            self._cached_pe is not None
            and self._cached_pe.shape[0] == batch_size
            and self._cached_pe.device == device
        ):
            pe = self._cached_pe
            x_pe = self._cached_x_pe
        else:
            combined_ids = torch.cat(
                [
                    x_ids,
                    x_ids,
                ],
                dim=1,
            )

            pe = self.pe_embedder(
                combined_ids
            )

            x_pe = (
                self.pe_embedder(x_ids)
                if self.use_patch_mixer
                else None
            )

            self._cached_pe = pe
            self._cached_x_pe = x_pe

        # ==================================================================
        # PATCH MIXER
        # ==================================================================

        if self.use_patch_mixer:
            for block in self.x_patch_mixer:
                img = block(
                    img,
                    vec=vec,
                    pe=x_pe,
                )

        # ==================================================================
        # CORE MMDiT
        # ==================================================================

        for block in self.double_blocks:

            img, txt = block(
                img=img,
                txt=txt,
                vec=vec,
                pe=pe,
            )

        # ------------------------------------------------------------------
        # Combine streams for single-stream blocks.
        # ------------------------------------------------------------------

        img = torch.cat(
            (
                txt,
                img,
            ),
            dim=1,
        )

        # ------------------------------------------------------------------
        # Single-stream blocks.
        # ------------------------------------------------------------------

        for block in self.single_blocks:

            img = block(
                img,
                vec=vec,
                pe=pe,
            )

        # Remove text tokens.

        img = img[
            :,
            txt.shape[1]:,
            ...,
        ]

        # ==================================================================
        # FINAL LAYER
        # ==================================================================

        # DirectML cannot reliably execute the final AdaLN/linear block.  Keep
        # the rest of MMDiT on DirectML and run only this small block on CPU.
 
        x = self.final_layer(img, vec)

        # ==================================================================
        # SEQUENCE -> 2D IMAGE
        # ==================================================================

        x = rearrange(
            x,
            "b (h w) c -> b c h w",
            h=(
                self.input_shape[0]
                // self.patch_size
            ),
            w=(
                self.input_shape[1]
                // self.patch_size
            ),
        )

        if self.patch_size > 1:

            x = unpack_images(
                x,
                self.patch_size,
            )

        return {
            "x": x
        }