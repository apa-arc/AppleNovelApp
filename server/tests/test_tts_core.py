import tempfile
import unittest
from pathlib import Path

from server.tts_core import find_model_assets, validate_synthesis_payload


class TtsCoreTests(unittest.TestCase):
    def test_valid_payload_is_normalized(self):
        self.assertEqual(
            validate_synthesis_payload({
                "model": "kokoro-multi-lang-v1_1",
                "speaker_id": 3,
                "text": "  你好。  ",
                "speed": 1.25,
            }),
            {
                "model": "kokoro-multi-lang-v1_1",
                "speaker_id": 3,
                "text": "你好。",
                "speed": 1.25,
            },
        )

    def test_payload_rejects_unknown_model_empty_text_and_long_text(self):
        for payload in (
            {"model": "other", "speaker_id": 0, "text": "hello"},
            {"speaker_id": 0, "text": "  "},
            {"speaker_id": 0, "text": "x" * 421},
        ):
            with self.subTest(payload=payload):
                with self.assertRaises(ValueError):
                    validate_synthesis_payload(payload)

    def test_payload_rejects_invalid_speakers_and_speed(self):
        for speaker_id in (-1, 103, True, "3"):
            with self.subTest(speaker_id=speaker_id):
                with self.assertRaises(ValueError):
                    validate_synthesis_payload({"speaker_id": speaker_id, "text": "你好"})
        for speed in (0.49, 2.01, True, "1.0"):
            with self.subTest(speed=speed):
                with self.assertRaises(ValueError):
                    validate_synthesis_payload({"speaker_id": 0, "text": "你好", "speed": speed})

    def test_model_assets_are_discovered_without_assuming_archive_root_name(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / "archive-root"
            nested = root / "kokoro-int8"
            (nested / "espeak-ng-data").mkdir(parents=True)
            for name in ("model.onnx", "voices.bin", "tokens.txt", "lexicon-zh.txt", "lexicon-us-en.txt"):
                (nested / name).write_text("fixture", encoding="utf-8")
            assets = find_model_assets(root)
            self.assertEqual(Path(assets["model"]).name, "model.onnx")
            self.assertEqual(Path(assets["voices"]).name, "voices.bin")
            self.assertEqual(Path(assets["data_dir"]).name, "espeak-ng-data")
            self.assertEqual(len(assets["lexicon"].split(",")), 2)


if __name__ == "__main__":
    unittest.main()
