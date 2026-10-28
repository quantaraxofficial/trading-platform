"""Runs the trade copier: an always-logged-in MT5 terminal per subscriber who copies automatically
(and per mirrored provider), handing each signal to all of them at once (core/copier_service.py).
Leave it running on the copier server; stop with Ctrl+C."""
from django.core.management.base import BaseCommand

from core.copier_service import Supervisor


class Command(BaseCommand):
    help = "Run the trade copier (one MT5 terminal per subscriber)"

    def add_arguments(self, parser):
        parser.add_argument("--seconds", type=float, default=None, help="stop after this long (testing)")

    def handle(self, *args, seconds=None, **opts):
        sup = Supervisor()
        self.stdout.write(f"Trade copier running ({'stand-in MT5' if sup.fake else 'MT5 terminals in ' + sup.terminals_dir}). Ctrl+C to stop.")
        try:
            sup.run(stop_after=seconds)
        except KeyboardInterrupt:
            pass
        self.stdout.write("Trade copier stopped.")
