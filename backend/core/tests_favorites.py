"""/api/users/favorites/<uid>/: the favourite drawing tools, kept in the account (the chart asked for
them and got a 404, a red line in the browser console)"""
from django.test import TestCase
from rest_framework.test import APIClient

from .models import TraderProfile, UserSession


class FavoriteToolsTests(TestCase):
    def setUp(self):
        self.c = APIClient()
        self.user = TraderProfile.objects.create(uid="f1", name="F", email="f1@test.invalid")
        UserSession.objects.create(user=self.user, session_key="fk1")
        self.url = "/api/users/favorites/f1/"

    def test_none_yet_is_an_empty_list_not_a_404(self):
        r = self.c.get(self.url, HTTP_X_SESSION_KEY="fk1")
        self.assertEqual((r.status_code, r.json()), (200, []))

    def test_saved_in_order_and_read_back(self):
        r = self.c.post(self.url, {"favorites": ["trendline", "rectangle", "trendline", "text"]}, format="json", HTTP_X_SESSION_KEY="fk1")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(self.c.get(self.url, HTTP_X_SESSION_KEY="fk1").json(), ["trendline", "rectangle", "text"])
        self.c.post(self.url, {"favorites": []}, format="json", HTTP_X_SESSION_KEY="fk1")
        self.assertEqual(self.c.get(self.url, HTTP_X_SESSION_KEY="fk1").json(), [])

    def test_only_the_account_itself_and_only_tool_names(self):
        self.assertEqual(self.c.get(self.url, HTTP_X_SESSION_KEY="someone-else").status_code, 401)
        self.assertEqual(self.c.post(self.url, {"favorites": "trendline"}, format="json", HTTP_X_SESSION_KEY="fk1").status_code, 400)
        self.assertEqual(self.c.post(self.url, {"favorites": [{"x": 1}]}, format="json", HTTP_X_SESSION_KEY="fk1").status_code, 400)
