"""The voice assistant notes what it can't do yet (core/voice.py) for Django Admin"""
from datetime import timedelta
from unittest import mock

from django.contrib.auth.models import User
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIRequestFactory

from . import voice
from .models import TraderProfile, VoiceRequest


class VoiceRequestTests(TestCase):
    def setUp(self):
        self.p = TraderProfile.objects.create(uid="v1", name="Asha", email="v@test.invalid")
        self.f = APIRequestFactory()

    def ask(self, answer, text="draw a gann fan from the last low"):
        with mock.patch.object(voice, "require_session", return_value=(self.p, None)), \
             mock.patch.object(voice, "access_of", return_value={"extras": {"voice": True}}, create=True), \
             mock.patch.object(voice, "_providers", return_value=[("t", "u", "k", "m")]), \
             mock.patch.object(voice, "_complete", return_value=answer):
            return voice.ask(self.f.post("/x/", {"text": text}, format="json"), self.p.uid)

    def test_cant_do_yet_is_noted(self):
        r = self.ask('{"reply": "I can\'t draw a Gann fan yet; I\'ve noted it for the team.", "actions": [], "unsupported": "draw a Gann fan from a swing low"}')
        self.assertEqual(r.status_code, 200, r.data)
        self.assertTrue(VoiceRequest.objects.exists(), r.data)
        v = VoiceRequest.objects.get()
        self.assertEqual((v.task, v.said, v.profile, v.status), ("draw a Gann fan from a swing low", "draw a gann fan from the last low", self.p, "new"))

    def test_normal_answers_are_not_noted(self):
        self.ask('{"reply": "Marking the order blocks.", "actions": [{"type": "mark", "what": ["order_blocks"]}]}', "mark order blocks")
        self.assertFalse(VoiceRequest.objects.exists())

    def test_admin_list(self):
        VoiceRequest.objects.create(profile=self.p, said="x", task="draw a Gann fan")
        self.client.force_login(User.objects.create_superuser("adm", "adm@test.invalid", "pw"))
        page = self.client.get("/admin/core/voicerequest/")
        self.assertContains(page, "draw a Gann fan")
