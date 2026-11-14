"""A collab link's preview (where it's shared) and the invite: public, ended collabs not found,
never the others' names"""
from django.test import TestCase
from rest_framework.test import APIClient

from .models import CollabMember, CollabRoom, TraderProfile


class CollabPreviewTests(TestCase):
    def setUp(self):
        from django.core.cache import cache
        cache.clear()
        own = TraderProfile.objects.create(uid="own", name="Aditya Singh", email="a@example.com")
        bob = TraderProfile.objects.create(uid="bob", name="Bob Secret", email="b@example.com")
        eve = TraderProfile.objects.create(uid="eve", name="Eve", email="e@example.com")
        self.room = CollabRoom.objects.create(token="tok123", owner=own, name="Gold scalps", symbol="XAU/USD", interval="15min")
        CollabMember.objects.create(room=self.room, profile=own, role="owner")
        from django.utils import timezone
        CollabMember.objects.create(room=self.room, profile=bob, role="editor", last_seen=timezone.now())
        CollabMember.objects.create(room=self.room, profile=eve, role="viewer")   # invited, never came
        self.c = APIClient()

    def test_preview(self):
        r = self.c.get("/api/users/collab/preview/tok123/")
        self.assertEqual(r.status_code, 200)
        d = r.json()
        self.assertEqual((d["owner_name"], d["name"], d["people"], d["kind"]), ("Aditya Singh", "Gold scalps", 2, "chart"))
        self.assertNotIn("Bob Secret", r.content.decode())

    def test_ended_or_unknown(self):
        self.assertEqual(self.c.get("/api/users/collab/preview/nope/").status_code, 404)
        self.room.active = False
        self.room.save()
        self.assertEqual(self.c.get("/api/users/collab/preview/tok123/").status_code, 404)
