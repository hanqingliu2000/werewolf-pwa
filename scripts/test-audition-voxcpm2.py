"""Check local audition isolation and presentation without loading the model."""
import importlib.util
import json
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

    def test_restrained_prompt_matches_requested_text(self):
        self.assertEqual(audition.STYLES["original"], audition.STYLE)
        self.assertEqual(audition.STYLES["restrained"], "中年男性，标准普通话，像日常说话一样平静自然。音色松弛，语速均匀，重音轻，语调起伏小，句尾平稳收住。")

    def test_young_prompt_contains_only_voice_and_language(self):
        self.assertEqual(audition.STYLES["young"], "偏年轻的男性声音，标准普通话。")

    def test_young_comparison_page(self):
        with tempfile.TemporaryDirectory() as folder:
            audition.make_page(Path(folder), {"night_start": "天黑，请闭眼。"},
                               comparison_label="之前克制版", comparison_bank="previous", voice_label="VoxCPM2 年轻男声")
            page = (Path(folder) / "index.html").read_text()
            self.assertIn("VoxCPM2 年轻男声 / 之前克制版", page)
            self.assertIn('src="previous/1.5/night_start.mp3"', page)
            self.assertIn('src="voxcpm2/1.5/night_start.mp3"', page)

    def test_restrained_comparison_labels_and_paths(self):
        with tempfile.TemporaryDirectory() as folder:
            audition.make_page(Path(folder), {"night_start": "天黑，请闭眼。"},
                               comparison_label="之前版本", comparison_bank="previous", voice_label="VoxCPM2 克制版")
            page = (Path(folder) / "index.html").read_text()
            self.assertIn("VoxCPM2 克制版 / 之前版本", page)
            self.assertIn('src="previous/1.5/night_start.mp3"', page)
            self.assertNotIn("qwen3/", page)

    def test_comparison_labels_are_escaped(self):
        with tempfile.TemporaryDirectory() as folder:
            audition.make_page(Path(folder), {"sample": "台词"}, comparison_label="<script>bad</script>")
            self.assertNotIn("<script>bad</script>", (Path(folder) / "index.html").read_text())

    def previous_fixture(self, base):
        directory = base / "pilot"
        record = {"text": "台词", "rates": {}}
        for rate in ("1", "1.5", "2"):
            path = directory / "voxcpm2" / rate / "sample.mp3"
            path.parent.mkdir(parents=True)
            path.write_bytes(b"test audio")
            record["rates"][rate] = {"sha256": audition.digest(path)}
        manifest = {"settings": {"model": audition.MODEL, "revision": audition.REVISION}, "clips": {"sample": record}}
        (directory / "manifest.json").write_text(json.dumps(manifest))
        return directory

    def test_previous_is_read_only_and_hash_checked(self):
        with tempfile.TemporaryDirectory() as folder:
            directory = self.previous_fixture(Path(folder))
            before = audition.digest(directory / "manifest.json")
            loaded, _ = audition.load_previous(Path(folder), "pilot", {"sample": "台词"})
            self.assertEqual(loaded, directory)
            self.assertEqual(before, audition.digest(directory / "manifest.json"))
            (directory / "voxcpm2/2/sample.mp3").write_bytes(b"changed")
            with self.assertRaisesRegex(ValueError, "Changed comparison audio"):
                audition.load_previous(Path(folder), "pilot", {"sample": "台词"})

    def test_comparison_requires_same_text_and_model(self):
        with tempfile.TemporaryDirectory() as folder:
            directory = self.previous_fixture(Path(folder))
            with self.assertRaisesRegex(ValueError, "text differs"):
                audition.load_previous(Path(folder), "pilot", {"sample": "不同台词"})
            manifest_path = directory / "manifest.json"
            manifest = json.loads(manifest_path.read_text())
            manifest["settings"]["revision"] = "different"
            manifest_path.write_text(json.dumps(manifest))
            with self.assertRaisesRegex(ValueError, "same pinned"):
                audition.load_previous(Path(folder), "pilot", {"sample": "台词"})

    def test_comparison_cannot_escape_audition_directory(self):
        with tempfile.TemporaryDirectory() as folder:
            with self.assertRaisesRegex(ValueError, "safe lowercase"):
                audition.load_previous(Path(folder), "../private", {})


if __name__ == "__main__":
    unittest.main()
