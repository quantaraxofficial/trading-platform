"""The voice AI's mark actions: trade setups by id or family pass, anything else is dropped"""
from django.test import SimpleTestCase

from .voice import clean_action


class SetupActionTests(SimpleTestCase):
    def test_setups_kept_by_id_or_family(self):
        a = clean_action({"type": "mark", "what": ["setups", "msnr_levels"], "setups": ["ict_silver_bullet", "msnr", "made_up"]})
        self.assertEqual(a["what"], ["setups", "msnr_levels"])
        self.assertEqual(a["setups"], ["ict_silver_bullet", "msnr"])

    def test_all_setups_when_none_named(self):
        a = clean_action({"type": "mark", "what": ["setups"]})
        self.assertNotIn("setups", a)

    def test_msnr_kinds_are_known(self):
        a = clean_action({"type": "mark", "what": ["msnr_levels", "msnr_gaps", "msnr_flips", "msnr_qm", "msnr_compression"]})
        self.assertEqual(len(a["what"]), 5)
