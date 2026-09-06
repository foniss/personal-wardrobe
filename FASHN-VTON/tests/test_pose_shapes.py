"""
Tests for pose image shape handling throughout the pipeline.

This test file verifies that:
1. draw_pose returns the correct shape when grayscale=True
2. numpy_to_torch handles different input shapes correctly
3. The expected tensor shapes for the model are correct
"""

import numpy as np
import pytest
import torch


class TestDrawPoseShapes:
    """Tests for draw_pose output shapes."""

    def test_draw_pose_grayscale_returns_2d_array(self):
        """draw_pose with grayscale=True should return shape (H, W), not (H, W, 1)."""
        from fashn_vton.dwpose import draw_pose
        from fashn_vton.utils import get_dummy_dw_keypoints

        H, W = 512, 384
        dummy_pose = get_dummy_dw_keypoints()

        result = draw_pose(dummy_pose, H, W, canvas_value=0, grayscale=True)

        # Grayscale should return 2D array (H, W)
        assert result.ndim == 2, f"Expected 2D array, got {result.ndim}D with shape {result.shape}"
        assert result.shape == (H, W), f"Expected shape ({H}, {W}), got {result.shape}"
        assert result.dtype == np.uint8, f"Expected dtype uint8, got {result.dtype}"

    def test_draw_pose_rgb_returns_3d_array(self):
        """draw_pose with grayscale=False should return shape (H, W, 3)."""
        from fashn_vton.dwpose import draw_pose
        from fashn_vton.utils import get_dummy_dw_keypoints

        H, W = 512, 384
        dummy_pose = get_dummy_dw_keypoints()

        result = draw_pose(dummy_pose, H, W, canvas_value=0, grayscale=False)

        # RGB should return 3D array (H, W, 3)
        assert result.ndim == 3, f"Expected 3D array, got {result.ndim}D with shape {result.shape}"
        assert result.shape == (H, W, 3), f"Expected shape ({H}, {W}, 3), got {result.shape}"
        assert result.dtype == np.uint8, f"Expected dtype uint8, got {result.dtype}"


class TestNumpyToTorchShapes:
    """Tests for numpy_to_torch conversion behavior."""

    def test_numpy_to_torch_3d_rgb_image(self):
        """numpy_to_torch should convert (H, W, C) to (C, H, W)."""
        from fashn_vton.utils import numpy_to_torch

        H, W, C = 512, 384, 3
        img = np.zeros((H, W, C), dtype=np.uint8)

        result = numpy_to_torch(img)

        assert result.shape == (C, H, W), f"Expected shape ({C}, {H}, {W}), got {result.shape}"

    def test_numpy_to_torch_2d_grayscale_passes_through(self):
        """numpy_to_torch with 2D input should pass through without permutation.

        The pipeline's numpy_to_torch checks ndim == 3 before permuting,
        so 2D grayscale images pass through unchanged.
        """
        from fashn_vton.utils import numpy_to_torch

        H, W = 512, 384
        img = np.zeros((H, W), dtype=np.uint8)  # 2D grayscale

        result = numpy_to_torch(img)

        # 2D input should pass through unchanged
        assert result.shape == (H, W), f"Expected shape ({H}, {W}), got {result.shape}"
        assert result.ndim == 2, f"Expected 2D tensor, got {result.ndim}D"

    def test_common_numpy_to_torch_with_2d_input(self):
        """Test the common package's numpy_to_torch with 2D input.

        The common package has: if permute and image.ndim == 3: ...
        So it should handle 2D gracefully by not permuting.
        """
        # Replicate the common package's numpy_to_torch logic
        def common_numpy_to_torch(image: np.ndarray, permute: bool = True) -> torch.Tensor:
            image = torch.from_numpy(image)
            if permute and image.ndim == 3:
                image = image.permute(2, 0, 1)
            return image

        H, W = 512, 384
        img = np.zeros((H, W), dtype=np.uint8)  # 2D grayscale

        result = common_numpy_to_torch(img)

        # With 2D input, no permutation should happen
        assert result.shape == (H, W), f"Expected shape ({H}, {W}), got {result.shape}"
        assert result.ndim == 2, f"Expected 2D tensor, got {result.ndim}D"


class TestExpectedModelTensorShapes:
    """Tests for expected tensor shapes going into the model."""

    def test_expected_pose_tensor_shape_single_sample(self):
        """Verify the expected pose tensor shape for a single sample.

        Based on the model architecture:
        - x_embedder expects: [x (3), ca_images (3), person_poses (1)] = 7 channels
        - garment_embedder expects: [garment_images (3), garment_poses (1)] = 4 channels

        So poses should be (batch, 1, H, W).
        """
        batch_size = 1
        H, W = 768, 576  # Model target size

        # Expected pose tensor shape
        expected_pose_shape = (batch_size, 1, H, W)

        # Create a grayscale pose image as draw_pose would return
        grayscale_pose = np.zeros((H, W), dtype=np.uint8)

        # The CORRECT way to convert: unsqueeze to add channel dim
        tensor = torch.from_numpy(grayscale_pose).unsqueeze(0).unsqueeze(0)

        assert tensor.shape == expected_pose_shape, \
            f"Expected shape {expected_pose_shape}, got {tensor.shape}"

    def test_expected_pose_tensor_shape_multi_sample(self):
        """Verify pose tensor shape for multiple samples."""
        batch_size = 4
        H, W = 768, 576

        expected_pose_shape = (batch_size, 1, H, W)

        grayscale_pose = np.zeros((H, W), dtype=np.uint8)
        tensor = torch.from_numpy(grayscale_pose).unsqueeze(0).unsqueeze(0)
        tensor = tensor.repeat(batch_size, 1, 1, 1)

        assert tensor.shape == expected_pose_shape, \
            f"Expected shape {expected_pose_shape}, got {tensor.shape}"

    def test_pipeline_prepare_tensor_grayscale(self):
        """Test the prepare_tensor logic from pipeline.py with grayscale input.

        The fixed numpy_to_torch handles 2D input correctly, so prepare_tensor
        doesn't need special grayscale handling anymore.
        """
        from fashn_vton.utils import normalize_uint8_to_neg1_1, numpy_to_torch

        H, W = 768, 576
        num_samples = 2

        # Grayscale pose image as draw_pose returns
        grayscale_pose = np.zeros((H, W), dtype=np.uint8)

        # The prepare_tensor function from pipeline.py (fixed version)
        def prepare_tensor(img: np.ndarray) -> torch.Tensor:
            t = numpy_to_torch(img).unsqueeze(0)  # (H, W) -> (1, H, W)
            t = normalize_uint8_to_neg1_1(t)
            t = t.repeat(num_samples, 1, 1, 1)  # Prepends dim: (1, H, W) -> (N, 1, H, W)
            return t

        result = prepare_tensor(grayscale_pose)

        expected_shape = (num_samples, 1, H, W)
        assert result.shape == expected_shape, \
            f"Expected shape {expected_shape}, got {result.shape}"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
