#!/usr/bin/env python3
"""
Debug script to visualize mask creation in the preprocessing pipeline.

Saves intermediate masks and images to debug_outputs/ directory.
"""

import argparse
import os
import sys

import cv2
import numpy as np
from PIL import Image

# Add src to path for imports
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

from fashn_human_parser import CATEGORY_TO_BODY_COVERAGE, FashnHumanParser

from fashn_vton.preprocessing import BODY_COVERAGE_TO_FASHN_LABELS, FASHN_LABELS_TO_IDS
from fashn_vton.preprocessing.masks import (
    asymmetric_dilate_mask,
    create_bounded_mask,
    create_contour_following_mask,
    dilate_mask,
)


def colorize_segmentation(seg_pred: np.ndarray) -> np.ndarray:
    """Convert segmentation prediction to colorized visualization."""
    # Define colors for each label (18 classes + background)
    colors = [
        [0, 0, 0],        # 0: background
        [255, 0, 0],      # 1: top
        [0, 255, 0],      # 2: bottom
        [0, 0, 255],      # 3: dress
        [255, 255, 0],    # 4: outerwear
        [255, 0, 255],    # 5: headwear
        [0, 255, 255],    # 6: eyewear
        [128, 0, 0],      # 7: footwear
        [0, 128, 0],      # 8: bag
        [0, 0, 128],      # 9: accessory
        [128, 128, 0],    # 10: belt
        [128, 0, 128],    # 11: face
        [0, 128, 128],    # 12: hair
        [255, 128, 0],    # 13: arms
        [255, 0, 128],    # 14: hands
        [128, 255, 0],    # 15: legs
        [0, 255, 128],    # 16: feet
        [128, 128, 128],  # 17: torso
    ]

    h, w = seg_pred.shape
    color_img = np.zeros((h, w, 3), dtype=np.uint8)

    for label_id, color in enumerate(colors):
        mask = seg_pred == label_id
        color_img[mask] = color

    return color_img


def save_mask(mask: np.ndarray, path: str, name: str):
    """Save boolean mask as image."""
    if mask.dtype == bool:
        mask_img = (mask.astype(np.uint8) * 255)
    else:
        mask_img = mask.astype(np.uint8)
        if mask_img.max() == 1:
            mask_img = mask_img * 255

    filepath = os.path.join(path, f"{name}.png")
    cv2.imwrite(filepath, mask_img)
    print(f"  Saved: {filepath}")


def save_image(img: np.ndarray, path: str, name: str):
    """Save RGB image."""
    filepath = os.path.join(path, f"{name}.png")
    if img.shape[-1] == 3:
        cv2.imwrite(filepath, cv2.cvtColor(img, cv2.COLOR_RGB2BGR))
    else:
        cv2.imwrite(filepath, img)
    print(f"  Saved: {filepath}")


def create_clothing_agnostic_image_debug(
    img_np: np.ndarray,
    seg_pred: np.ndarray,
    labels_to_segment_indices: list,
    body_coverage: str,
    output_dir: str,
    mask_value: int = 127,
    min_distance_threshold: float = 100.0,
    baseline_height: float = 864.0,
    mask_limbs: bool = True,
) -> np.ndarray:
    """
    Create clothing-agnostic image with debug visualization of all intermediate masks.
    """
    from fashn_vton.preprocessing.agnostic import IDENTITY_FASHN_LABELS, _create_hybrid_contour_bounded_mask

    print("\n=== Creating Clothing-Agnostic Image (with debug) ===")

    # Scale parameters based on image height
    height_scale = seg_pred.shape[0] / baseline_height
    print(f"Height scale factor: {height_scale:.3f} (height: {seg_pred.shape[0]})")

    # Add body parts to mask based on body coverage
    labels_ids_dict = FASHN_LABELS_TO_IDS.copy()
    original_labels = labels_to_segment_indices.copy()

    if mask_limbs:
        if body_coverage in ("full", "upper"):
            labels_to_segment_indices += [labels_ids_dict["arms"], labels_ids_dict["torso"]]
        if body_coverage in ("full", "lower"):
            labels_to_segment_indices += [labels_ids_dict["legs"]]

    print(f"Original label indices: {original_labels}")
    print(f"Labels to segment (with limbs): {labels_to_segment_indices}")

    # Create base mask
    mask = np.isin(seg_pred, labels_to_segment_indices)
    save_mask(mask, output_dir, "01_base_mask")

    # Buffer mask to avoid leaks
    scaled_buffer_kernel = max(1, int(4 * height_scale))
    print(f"Buffer kernel size: {scaled_buffer_kernel}")
    buffer_mask = dilate_mask(mask, kernel=(scaled_buffer_kernel, scaled_buffer_kernel))
    save_mask(buffer_mask, output_dir, "02_buffer_mask")

    # Create bounded mask
    bounded_mask = create_bounded_mask(mask)
    save_mask(bounded_mask, output_dir, "03_bounded_mask")

    # Create contour following mask
    scaled_brush_radius = max(1, int(18 * height_scale))
    print(f"Contour brush radius: {scaled_brush_radius}")
    contour_mask = create_contour_following_mask(mask, brush_radius=scaled_brush_radius)
    save_mask(contour_mask, output_dir, "04_contour_mask")

    # Create hybrid mask
    ca_mask = _create_hybrid_contour_bounded_mask(
        contour_mask, bounded_mask, min_distance_threshold=min_distance_threshold
    )
    save_mask(ca_mask, output_dir, "05_hybrid_mask")

    # Apply asymmetric dilation for inpainting workspace
    scaled_right = int(33 * height_scale)
    scaled_left = int(33 * height_scale)
    scaled_up = int(16 * height_scale)
    scaled_down = int(16 * height_scale)
    print(f"Asymmetric dilation: R={scaled_right}, L={scaled_left}, U={scaled_up}, D={scaled_down}")
    ca_mask_dilated = asymmetric_dilate_mask(ca_mask, right=scaled_right, left=scaled_left, up=scaled_up, down=scaled_down)
    save_mask(ca_mask_dilated, output_dir, "06_ca_mask_dilated")

    # Create exclusion mask (regions to preserve)
    identity_ids = [labels_ids_dict[label] for label in IDENTITY_FASHN_LABELS]
    print(f"Identity labels: {IDENTITY_FASHN_LABELS}")
    print(f"Identity IDs: {identity_ids}")

    # Conditional identity based on coverage
    if body_coverage == "upper":
        identity_ids.append(labels_ids_dict["legs"])
    elif body_coverage == "lower":
        identity_ids.append(labels_ids_dict["arms"])

    exclusion_mask = np.isin(seg_pred, identity_ids)
    save_mask(exclusion_mask, output_dir, "07_exclusion_mask_base")

    # Handle hands and feet
    if body_coverage in ("full", "upper"):
        hands_mask = seg_pred == labels_ids_dict["hands"]
        exclusion_mask = exclusion_mask | hands_mask

    if body_coverage in ("full", "lower"):
        feet_mask = seg_pred == labels_ids_dict["feet"]
        exclusion_mask = exclusion_mask | feet_mask

    save_mask(exclusion_mask, output_dir, "08_exclusion_mask_final")

    # Final mask
    final_mask = buffer_mask | (ca_mask_dilated & ~exclusion_mask)
    save_mask(final_mask, output_dir, "09_final_mask")

    # Apply mask to image
    result = img_np.copy()
    result[final_mask] = mask_value
    save_image(result, output_dir, "10_ca_image_result")

    return result


def create_garment_image_debug(
    img_np: np.ndarray,
    seg_pred: np.ndarray,
    labels_to_segment_indices: list,
    output_dir: str,
    mask_value: int = 127,
) -> np.ndarray:
    """Create garment image with debug visualization."""
    print("\n=== Creating Garment Image (with debug) ===")

    # Create mask for selected labels
    selected_labels_mask = np.isin(seg_pred, labels_to_segment_indices)
    save_mask(selected_labels_mask, output_dir, "garment_01_selected_labels_mask")
    save_mask(~selected_labels_mask, output_dir, "garment_02_mask_to_fill")

    result = img_np.copy()
    result[~selected_labels_mask] = mask_value
    save_image(result, output_dir, "garment_03_result")

    return result


def main():
    parser = argparse.ArgumentParser(
        description="Debug mask creation pipeline - visualizes all intermediate masks",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Example:
    python scripts/debug_masks.py
    python scripts/debug_masks.py --person-image my_person.jpg --category bottoms
        """,
    )
    parser.add_argument(
        "--person-image",
        type=str,
        default=None,
        help="Path to person image (default: examples/data/model.webp)",
    )
    parser.add_argument(
        "--garment-image",
        type=str,
        default=None,
        help="Path to garment image (default: examples/data/garment.webp)",
    )
    parser.add_argument(
        "--category",
        type=str,
        default="tops",
        choices=["tops", "bottoms", "one-pieces"],
        help="Garment category (default: tops)",
    )
    parser.add_argument(
        "--output-dir",
        type=str,
        default="debug_outputs",
        help="Output directory (default: debug_outputs)",
    )
    args = parser.parse_args()

    # Setup paths
    script_dir = os.path.dirname(__file__)
    repo_dir = os.path.dirname(script_dir)
    examples_data_dir = os.path.join(repo_dir, "examples", "data")
    output_dir = args.output_dir if os.path.isabs(args.output_dir) else os.path.join(repo_dir, args.output_dir)

    os.makedirs(output_dir, exist_ok=True)

    person_path = args.person_image or os.path.join(examples_data_dir, "model.webp")
    garment_path = args.garment_image or os.path.join(examples_data_dir, "garment.webp")

    if not os.path.exists(person_path):
        print(f"Error: Person image not found: {person_path}")
        sys.exit(1)
    if not os.path.exists(garment_path):
        print(f"Error: Garment image not found: {garment_path}")
        sys.exit(1)

    print("Loading images:")
    print(f"  Person: {person_path}")
    print(f"  Garment: {garment_path}")
    print(f"Output will be saved to {output_dir}")

    # Load images
    person_image = Image.open(person_path).convert("RGB")
    garment_image = Image.open(garment_path).convert("RGB")

    person_np = np.array(person_image)
    garment_np = np.array(garment_image)

    print(f"\nPerson image shape: {person_np.shape}")
    print(f"Garment image shape: {garment_np.shape}")

    # Save original images
    save_image(person_np, output_dir, "00_person_original")
    save_image(garment_np, output_dir, "00_garment_original")

    # Load human parser
    print("\nLoading FashnHumanParser...")
    hp_model = FashnHumanParser(device="cpu")

    # Run segmentation
    print("Running human parsing on person image...")
    person_seg = hp_model.predict(person_np)
    print("Running human parsing on garment image...")
    garment_seg = hp_model.predict(garment_np)

    # Save colorized segmentations
    save_image(colorize_segmentation(person_seg), output_dir, "00_person_segmentation")
    save_image(colorize_segmentation(garment_seg), output_dir, "00_garment_segmentation")

    # Get labels for specified category
    category = args.category
    body_coverage = CATEGORY_TO_BODY_COVERAGE.get(category)
    labels_to_segment = BODY_COVERAGE_TO_FASHN_LABELS.get(body_coverage)
    labels_to_segment_indices = [FASHN_LABELS_TO_IDS[label] for label in labels_to_segment]

    print(f"\nCategory: {category}")
    print(f"Body coverage: {body_coverage}")
    print(f"Labels to segment: {labels_to_segment}")
    print(f"Label indices: {labels_to_segment_indices}")

    # Create clothing-agnostic image with debug
    ca_output_dir = os.path.join(output_dir, "ca_masks")
    os.makedirs(ca_output_dir, exist_ok=True)

    ca_image = create_clothing_agnostic_image_debug(
        img_np=person_np.copy(),
        seg_pred=person_seg.copy(),
        labels_to_segment_indices=labels_to_segment_indices.copy(),
        body_coverage=body_coverage,
        output_dir=ca_output_dir,
    )

    # Create garment image with debug
    garment_output_dir = os.path.join(output_dir, "garment_masks")
    os.makedirs(garment_output_dir, exist_ok=True)

    garment_image_processed = create_garment_image_debug(
        img_np=garment_np.copy(),
        seg_pred=garment_seg.copy(),
        labels_to_segment_indices=labels_to_segment_indices.copy(),
        output_dir=garment_output_dir,
    )

    print("\n=== Done! ===")
    print(f"All debug outputs saved to: {output_dir}")
    print(f"  - CA masks: {ca_output_dir}")
    print(f"  - Garment masks: {garment_output_dir}")


if __name__ == "__main__":
    main()
