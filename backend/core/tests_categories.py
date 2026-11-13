"""Student categories in Django admin (core/categories_admin.py): made, filled from Trader profiles'
actions and from their own page, shown and filtered on Trader profiles"""
from django.contrib.admin import helpers
from django.contrib.auth.models import User
from django.test import TestCase

from .models import TraderCategory, TraderProfile


class StudentCategoryTests(TestCase):
    def setUp(self):
        self.a = TraderProfile.objects.create(uid="ca", name="Asha", email="asha@test.invalid")
        self.b = TraderProfile.objects.create(uid="cb", name="Bilal", email="bilal@test.invalid")
        self.c = TraderProfile.objects.create(uid="cc", name="Chen", email="chen@test.invalid")
        self.client.force_login(User.objects.create_superuser("adm", "adm@test.invalid", "pw"))
        self.url = "/admin/core/traderprofile/"

    def act(self, action, ids, **extra):
        return self.client.post(self.url, {"action": action, helpers.ACTION_CHECKBOX_NAME: ids, **extra})

    def test_add_to_a_new_category_then_remove(self):
        # the action first asks which category
        r = self.act("add_to_category", [self.a.pk, self.b.pk])
        self.assertContains(r, "Add to a category")
        self.assertContains(r, "Asha")
        # a new one, named there
        r = self.act("add_to_category", [self.a.pk, self.b.pk], apply="1", new_name="Batch A")
        self.assertEqual(r.status_code, 302)
        cat = TraderCategory.objects.get(name="Batch A")
        self.assertEqual(set(cat.traders.values_list("uid", flat=True)), {"ca", "cb"})
        # an existing one, chosen
        self.act("add_to_category", [self.c.pk], apply="1", category=cat.pk)
        self.assertEqual(cat.traders.count(), 3)
        self.act("remove_from_category", [self.b.pk], apply="1", category=cat.pk)
        self.assertEqual(set(cat.traders.values_list("uid", flat=True)), {"ca", "cc"})
        # nothing chosen: asked again, nothing changes
        r = self.act("remove_from_category", [self.a.pk], apply="1")
        self.assertContains(r, "Choose a category")
        self.assertEqual(cat.traders.count(), 2)

    def test_shown_and_filtered_on_trader_profiles(self):
        cat = TraderCategory.objects.create(name="Weekend class")
        cat.traders.add(self.a)
        r = self.client.get(self.url)
        self.assertContains(r, 'class="tp-chip"')
        self.assertContains(r, "Weekend class")
        r = self.client.get(f"{self.url}?categories__id__exact={cat.pk}")
        self.assertContains(r, "asha@test.invalid")
        self.assertNotContains(r, "bilal@test.invalid")

    def test_category_page_counts_and_adds_students(self):
        cat = TraderCategory.objects.create(name="Batch B", note="Mornings")
        cat.traders.add(self.a, self.b)
        r = self.client.get("/admin/core/tradercategory/")
        self.assertContains(r, "Batch B")
        self.assertContains(r, f"?categories__id__exact={cat.pk}\">2<")
        through = TraderProfile.categories.through
        r = self.client.post(f"/admin/core/tradercategory/{cat.pk}/change/", {
            "name": "Batch B", "note": "Mornings",
            "TraderProfile_categories-TOTAL_FORMS": "3", "TraderProfile_categories-INITIAL_FORMS": "2",
            "TraderProfile_categories-MIN_NUM_FORMS": "0", "TraderProfile_categories-MAX_NUM_FORMS": "1000",
            **{f"TraderProfile_categories-{i}-{k}": v for i, row in enumerate(through.objects.filter(tradercategory=cat))
               for k, v in (("id", row.pk), ("tradercategory", cat.pk), ("traderprofile", row.traderprofile_id))},
            "TraderProfile_categories-2-tradercategory": cat.pk, "TraderProfile_categories-2-traderprofile": self.c.pk,
        })
        self.assertEqual(r.status_code, 302, r.content.decode()[:3000])
        self.assertEqual(cat.traders.count(), 3)
        # and a trader's own page has it
        self.assertContains(self.client.get(f"/admin/core/traderprofile/{self.c.pk}/change/"), "Batch B")
