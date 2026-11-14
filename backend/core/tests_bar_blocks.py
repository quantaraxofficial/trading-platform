"""Intraday bars that don't fit evenly into 4 hours restart at each 4-hour boundary (core/market.py)"""
from django.test import SimpleTestCase

from .market import bucket_of, in_blocks

H4 = 1739959200   # Wed 19 Feb 2025, 10:00 UTC: a 4-hour bar's start (15:30 IST)


class BarBlockTests(SimpleTestCase):
    def labels(self, n, minutes):
        return sorted({bucket_of("intraday", n, (H4 + m * 60) * 1000) for m in range(minutes)})

    def test_45m_five_then_a_short_one_inside_each_4h_bar(self):
        got = [(t - H4) // 60 for t in self.labels(2700, 300)]
        self.assertEqual(got, [0, 45, 90, 135, 180, 225, 240, 285])   # ..., 225 (15 min long), 240: the next 4h bar
        self.assertEqual(bucket_of("intraday", 14400, (H4 + 239 * 60) * 1000), H4)

    def test_which_lengths(self):
        self.assertEqual([in_blocks(n * 60) for n in (15, 30, 45, 50, 60, 90, 120, 180, 240)],
                         [False, False, True, True, False, True, False, False, False])
        # the ones that fit, and 3h, keep counting from the day's start
        self.assertEqual([(t - H4) // 60 for t in self.labels(1800, 61)], [0, 30, 60])
