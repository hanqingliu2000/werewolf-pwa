"""Check local audition isolation and presentation without loading the model."""
import importlib.util
from pathlib import Path
import tempfile
import unittest

SPEC = importlib.util.spec_from_file_location("audition", Path(__file__).with_name("audition-voxcpm2.py"))
audition = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(audition)


class AuditionTests(unittest.TestCase):
    def test_model_revision_is_pinned(self):
        self.assertRegex(audition.REVISION, r"^[a-f0-9]{40}$")
        self.assertEqual(audition.MODEL, "mlx-community/VoxCPM2-bf16")

    def test_page_has_matched_comparisons_and_no_autoplay(self):
        with tempfile.TemporaryDirectory() as folder:
            audition.make_page(Path(folder), {"night_start": "天黑，请闭眼。"})
            page = (Path(folder) / "index.html").read_text()
            self.assertEqual(page.count("<audio "), 2)
            self.assertIn('src="voxcpm2/1.5/night_start.mp3"', page)
            self.assertIn('src="qwen3/1.5/night_start.mp3"', page)
            self.assertNotIn("autoplay", page)
            self.assertNotIn("playbackRate", page)

    def test_text_is_escaped(self):
        with tempfile.TemporaryDirectory() as folder:
            audition.make_page(Path(folder), {"sample": '<script>alert("sample")</script>'})
            page = (Path(folder) / "index.html").read_text()
            self.assertNotIn('<script>alert("sample")</script>', page)
            self.assertIn("&lt;script&gt;", page)

    def test_fingerprint(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "sample.txt"
            path.write_bytes(b"abc")
            self.assertEqual(audition.digest(path), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad")


if __name__ == "__main__":
    unittest.main()
