import sys
from pathlib import Path
from types import SimpleNamespace
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from liveness_engine import LivenessEngine
import cv2


def test_screen_moire_and_glare_detector_identifies_clean_natural_frame():
    engine = LivenessEngine()
    # Create natural skin-like frame with organic gradient + camera noise
    np.random.seed(42)
    base = np.full((200, 200, 3), 130, dtype=np.uint8)
    noise = np.random.normal(0, 8, (200, 200, 3))
    img = np.clip(base + noise, 0, 255).astype(np.uint8)

    moire_score, glare_ratio = engine._detect_screen_moire_and_glare(img)
    assert 0.0 <= moire_score <= 0.60
    assert 0.0 <= glare_ratio <= 0.15


def test_moire_glare_detector_handles_empty_frame_safely():
    engine = LivenessEngine()
    empty = np.zeros((0, 0, 3), dtype=np.uint8)
    moire_score, glare_ratio = engine._detect_screen_moire_and_glare(empty)
    assert moire_score == 0.0
    assert glare_ratio == 0.0


def test_passive_liveness_rejects_static_frozen_consecutive_frames(monkeypatch):
    engine = LivenessEngine()

    # Generate a realistic mock frame
    frame = np.full((160, 160, 3), 120, dtype=np.uint8)
    success, encoded = cv2.imencode(".jpg", frame)
    assert success
    jpeg_bytes = encoded.tobytes()

    # Mock process_frame to simulate a face present with good depth
    mock_metrics = SimpleNamespace(
        face_detected=True,
        is_low_light=False,
        is_spoof=False,
        landmark_z_std=0.02,
        texture_variance=140.0,
    )
    monkeypatch.setattr(engine, "process_frame", lambda _bytes: mock_metrics)

    # When both frames are identical (0 pixel diff -> static frozen image attack)
    result = engine.evaluate_passive_liveness(jpeg_bytes, aux_jpeg=jpeg_bytes)
    assert result["is_spoof"] is True
    assert "static frozen frame" in result["reason"]


def test_passive_liveness_accepts_natural_motion_between_two_frames(monkeypatch):
    engine = LivenessEngine()

    frame1 = np.full((160, 160, 3), 120, dtype=np.uint8)
    frame2 = np.full((160, 160, 3), 128, dtype=np.uint8) # Slight natural lighting/movement shift

    _, enc1 = cv2.imencode(".jpg", frame1)
    _, enc2 = cv2.imencode(".jpg", frame2)

    mock_metrics = SimpleNamespace(
        face_detected=True,
        is_low_light=False,
        is_spoof=False,
        landmark_z_std=0.022,
        texture_variance=150.0,
    )
    monkeypatch.setattr(engine, "process_frame", lambda _bytes: mock_metrics)

    result = engine.evaluate_passive_liveness(enc1.tobytes(), aux_jpeg=enc2.tobytes())
    assert result["is_spoof"] is False
    assert result["is_low_light"] is False
    assert result["liveness_score"] >= 0.88
