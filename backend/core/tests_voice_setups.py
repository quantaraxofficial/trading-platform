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


class KnowledgeTests(SimpleTestCase):
    """The long knowledge (MSNR, setups, liquidity) goes with a request only when it's the subject"""

    def test_only_when_it_comes_up(self):
        from .voice import knowledge_for
        self.assertEqual(knowledge_for(["open gold on the 15 minute"]), [])
        msnr = knowledge_for(["mark the malaysian s and r"])
        self.assertTrue(any("A level" in k for k in msnr))
        self.assertTrue(any("Silver Bullet" in k for k in knowledge_for(["how do I trade the silver bullet"])))
        self.assertTrue(any("inducement" in k.lower() for k in knowledge_for(["where is the sell side liquidity"])))
        # (misheard: "kazi modo" is Quasimodo)
        self.assertTrue(knowledge_for(["what is a kazi modo"]))

    def test_liquidity_marks_known(self):
        a = clean_action({"type": "mark", "what": ["session_liquidity", "inducement", "trendline_liquidity", "liquidity_voids", "round_numbers", "draw_on_liquidity"]})
        self.assertEqual(len(a["what"]), 6)
        b = clean_action({"type": "mark", "what": ["setups"], "setups": ["liquidity", "pa_orb", "pa_flag", "pa_wyckoff", "liq_idm_poi"]})
        self.assertEqual(b["setups"], ["liquidity", "pa_orb", "pa_flag", "pa_wyckoff", "liq_idm_poi"])


class ZoneStateTests(SimpleTestCase):
    """Order blocks, FVGs, IFVGs and POIs by state (fresh, tapped, all); mitigation blocks a mark of their own"""

    def test_state_kept_for_zone_marks(self):
        a = clean_action({"type": "mark", "what": ["order_blocks", "fvg", "ifvg", "poi"], "state": "tapped"})
        self.assertEqual(a["state"], "tapped")
        self.assertEqual(clean_action({"type": "mark", "what": ["fvg"], "state": "all"})["state"], "all")

    def test_state_dropped_when_unknown_or_unrelated(self):
        self.assertNotIn("state", clean_action({"type": "mark", "what": ["fvg"], "state": "weird"}))
        self.assertNotIn("state", clean_action({"type": "mark", "what": ["structure"], "state": "fresh"}))

    def test_mitigation_blocks_known(self):
        a = clean_action({"type": "mark", "what": ["mitigation_blocks", "breakers"]})
        self.assertEqual(a["what"], ["mitigation_blocks", "breakers"])


class BiasActionTests(SimpleTestCase):
    """"Analyse the last hour and predict the next": the window read and the one ahead"""

    def test_window_and_horizon(self):
        a = clean_action({"type": "bias", "window": {"value": 1, "unit": "hour"}, "horizon": {"value": 4, "unit": "hours"}})
        self.assertEqual(a, {"type": "bias", "window": {"value": 1, "unit": "hour"}, "horizon": {"value": 4, "unit": "hour"}})

    def test_one_given_is_both_and_none_is_an_hour(self):
        self.assertEqual(clean_action({"type": "bias", "horizon": {"value": 4, "unit": "hour"}})["window"], {"value": 4, "unit": "hour"})
        self.assertEqual(clean_action({"type": "bias"})["horizon"], {"value": 1, "unit": "hour"})

    def test_out_of_range_spans_dropped(self):
        a = clean_action({"type": "bias", "window": {"value": 5, "unit": "minute"}, "horizon": {"value": 3, "unit": "month"}})
        self.assertEqual(a["window"], {"value": 1, "unit": "hour"})

    def test_bias_drawings_clear(self):
        self.assertEqual(clean_action({"type": "clear_marks", "what": ["bias"]})["what"], ["bias"])
        self.assertIsNone(clean_action({"type": "mark", "what": ["bias"]}))


class ImageThemeActionTests(SimpleTestCase):
    """A chart screenshot's colours on this chart: all of it, or only some parts"""

    def test_parts_kept_and_unknown_dropped(self):
        self.assertEqual(clean_action({"type": "theme_from_image"}), {"type": "theme_from_image"})
        self.assertEqual(clean_action({"type": "theme_from_image", "parts": ["candles", "logo", "candles"]}), {"type": "theme_from_image", "parts": ["candles"]})
