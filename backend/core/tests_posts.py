"""Profiles' photos, social links and posts (core/posts.py)"""
import io
import shutil
import tempfile

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from PIL import Image
from rest_framework.test import APIClient

from . import posts as posts_mod
from .models import Follow, Post, TraderProfile, UserSession

TMP = tempfile.mkdtemp(prefix="tp-posts-")


def photo(name="p.jpg", gps=True, size=(3000, 2000)):
    im = Image.new("RGB", size, (120, 60, 200))
    exif = Image.Exif()
    if gps:
        exif[0x8825] = {2: (51.0, 30.0, 0.0), 1: "N"}   # GPSInfo: a location
    b = io.BytesIO()
    im.save(b, "JPEG", exif=exif)
    return SimpleUploadedFile(name, b.getvalue(), content_type="image/jpeg")


def video(name="clip.mp4"):
    return SimpleUploadedFile(name, b"\x00\x00\x00\x18ftypmp42" + b"\x00" * 5000, content_type="video/mp4")


@override_settings(POST_FILES_ROOT=TMP)
class PostTests(TestCase):
    @classmethod
    def tearDownClass(cls):
        super().tearDownClass()
        shutil.rmtree(TMP, ignore_errors=True)

    def setUp(self):
        self.c = APIClient()
        self.people = {}
        for u in ("asha", "ben", "cara"):
            p = TraderProfile.objects.create(uid=u, name=u.title(), email=f"{u}@test.invalid", username=f"{u}_t")
            UserSession.objects.create(user=p, session_key=f"k{u}")
            self.people[u] = p
        Follow.objects.create(follower=self.people["ben"], following=self.people["asha"])   # Ben follows Asha; Cara doesn't

    def api(self, who, method, path, data=None, fmt="json", **extra):
        return getattr(self.c, method)(f"/api/users/social/{who}/{path}?session_key=k{who}", data, format=fmt, **extra) if method != "get" \
            else self.c.get(f"/api/users/social/{who}/{path}", {**(data or {}), "session_key": f"k{who}"}, **extra)

    def make(self, who, caption, visibility="public", files=None):
        r = self.api(who, "post", "posts/", {"caption": caption, "visibility": visibility, "files": files or [photo()]}, fmt="multipart")
        self.assertEqual(r.status_code, 201, r.content)
        return r.json()["post"]

    def test_photo_reencoded_without_location(self):
        p = self.make("asha", "Gold #XAUUSD breakout")
        m = p["media"][0]
        self.assertEqual((m["kind"], m["width"], m["height"]), ("image", 2048, 1365))   # shrunk to 2048
        r = self.api("asha", "get", f"posts/{p['id']}/media/{m['id']}/")
        self.assertEqual(r.status_code, 200)
        img = Image.open(io.BytesIO(b"".join(r.streaming_content)))
        self.assertNotIn(0x8825, img.getexif())   # no GPS left
        self.assertEqual(Post.objects.get(id=p["id"]).tags, " xauusd ")

    def test_followers_only_posts_and_their_files(self):
        pub = self.make("asha", "for everyone")
        priv = self.make("asha", "for my followers #setup", "followers", [photo(), video()])
        self.assertEqual(priv["media"][1]["kind"], "video")
        seen = lambda who: {p["caption"] for p in self.api(who, "get", "posts/").json()["posts"]}
        self.assertEqual(seen("ben"), {"for everyone", "for my followers #setup"})   # a follower
        self.assertEqual(seen("cara"), {"for everyone"})                            # not a follower
        self.assertEqual(seen("asha"), {"for everyone", "for my followers #setup"})  # its author
        mid = priv["media"][0]["id"]
        self.assertEqual(self.api("cara", "get", f"posts/{priv['id']}/media/{mid}/").status_code, 404)
        self.assertEqual(self.api("cara", "get", f"posts/{priv['id']}/").status_code, 404)
        self.assertEqual(self.api("ben", "get", f"posts/{priv['id']}/media/{mid}/").status_code, 200)
        self.assertEqual(self.api("cara", "get", f"posts/{pub['id']}/media/{pub['media'][0]['id']}/").status_code, 200)
        # the video in byte ranges (seeking)
        vid = priv["media"][1]["id"]
        r = self.api("ben", "get", f"posts/{priv['id']}/media/{vid}/", HTTP_RANGE="bytes=0-99")
        self.assertEqual((r.status_code, r["Content-Range"], len(b"".join(r.streaming_content))), (206, "bytes 0-99/5012", 100))
        # the profile counts what the viewer may see
        prof = lambda who: self.api(who, "get", "people/asha_t/").json()["profile"]["posts"]
        self.assertEqual((prof("ben"), prof("cara")), (2, 1))

    def test_search(self):
        self.make("asha", "London open on #gold today")
        self.make("ben", "EURUSD range trade")
        self.make("asha", "secret #gold plan", "followers")
        q = lambda who, s: sorted(p["caption"] for p in self.api(who, "get", "posts/", {"q": s}).json()["posts"])
        self.assertEqual(q("cara", "#gold"), ["London open on #gold today"])
        self.assertEqual(q("ben", "#gold"), ["London open on #gold today", "secret #gold plan"])
        self.assertEqual(q("cara", "range"), ["EURUSD range trade"])
        self.assertEqual(q("cara", "@asha"), ["London open on #gold today"])
        self.assertEqual(q("cara", "Ben"), ["EURUSD range trade"])   # by its author's name
        self.assertEqual(len(self.api("cara", "get", "posts/", {"author": "asha_t"}).json()["posts"]), 1)

    def test_only_its_author_edits_or_deletes(self):
        p = self.make("asha", "draft")
        self.assertEqual(self.api("ben", "patch", f"posts/{p['id']}/", {"caption": "hacked"}).status_code, 403)
        r = self.api("asha", "patch", f"posts/{p['id']}/", {"caption": "final #eth", "visibility": "followers"})
        self.assertEqual((r.json()["post"]["caption"], r.json()["post"]["visibility"]), ("final #eth", "followers"))
        path = Post.objects.get(id=p["id"]).media.first().path
        self.assertTrue(posts_mod.storage().exists(path))
        self.assertEqual(self.api("asha", "delete", f"posts/{p['id']}/").status_code, 204)
        self.assertFalse(posts_mod.storage().exists(path))

    def test_refused_uploads(self):
        bad = lambda files, **kw: self.api("asha", "post", "posts/", {"caption": "x", "files": files, **kw}, fmt="multipart")
        self.assertEqual(bad([]).status_code, 400)
        self.assertEqual(bad([SimpleUploadedFile("x.svg", b"<svg/>")]).status_code, 400)
        self.assertEqual(bad([SimpleUploadedFile("fake.jpg", b"not a picture")]).status_code, 400)
        self.assertEqual(bad([SimpleUploadedFile("fake.mp4", b"not a video at all")]).status_code, 400)
        self.assertEqual(bad([photo() for _ in range(11)]).status_code, 400)
        self.assertEqual(bad([photo()], visibility="secret").status_code, 400)

    def test_avatar_and_links(self):
        r = self.api("asha", "post", "me/avatar/", {"file": photo(size=(1200, 900))}, fmt="multipart")
        self.assertEqual(r.status_code, 200)
        url = r.json()["avatar"]
        self.assertTrue(url.startswith("/api/users/social/avatar/asha_t/"))
        img = self.c.get(url)
        self.assertEqual(img.status_code, 200)
        pic = Image.open(io.BytesIO(b"".join(img.streaming_content)))
        self.assertEqual(max(pic.size), 512)
        self.assertNotIn(0x8825, pic.getexif())
        self.assertEqual(self.api("cara", "get", "people/asha_t/").json()["profile"]["avatar"], url)
        # links: handles and links, checked
        r = self.api("asha", "patch", "me/", {"links": [
            {"kind": "instagram", "url": "@asha.trades"}, {"kind": "x", "url": "https://twitter.com/asha"},
            {"kind": "website", "url": "asha.example.com"}, {"kind": "youtube", "url": ""}]})
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual([l["url"] for l in r.json()["me"]["links"]],
                         ["https://instagram.com/asha.trades", "https://twitter.com/asha", "https://asha.example.com"])
        self.assertEqual(self.api("asha", "patch", "me/", {"links": [{"kind": "instagram", "url": "https://evil.example/x"}]}).status_code, 400)
        self.assertEqual(self.api("asha", "patch", "me/", {"links": [{"kind": "website", "url": "javascript:alert(1)"}]}).status_code, 400)
        self.assertEqual(len(self.api("cara", "get", "people/asha_t/").json()["profile"]["links"]), 3)
        # removing the photo
        self.assertEqual(self.api("asha", "delete", "me/avatar/").json()["avatar"], "")
        self.assertEqual(self.c.get(url).status_code, 404)


@override_settings(POST_FILES_ROOT=TMP)
class InteractionTests(PostTests):
    test_photo_reencoded_without_location = test_followers_only_posts_and_their_files = test_search = None
    test_only_its_author_edits_or_deletes = test_refused_uploads = test_avatar_and_links = None
    """Likes, comments and sharing, as each post's settings allow"""
    def test_likes(self):
        p = self.make("asha", "like me")
        r = self.api("cara", "post", f"posts/{p['id']}/like/")
        self.assertEqual(r.json(), {"liked": True, "likes": 1})
        self.api("cara", "post", f"posts/{p['id']}/like/")                     # again: still one
        self.api("cara", "delete", f"posts/{p['id']}/like/")
        self.api("cara", "post", f"posts/{p['id']}/like/")
        from .models import Notification
        self.assertEqual(Notification.objects.filter(recipient=self.people["asha"], kind="like").count(), 1)
        got = self.api("cara", "get", f"posts/{p['id']}/").json()["post"]
        self.assertEqual((got["likes"], got["liked"]), (1, True))
        priv = self.make("asha", "followers", "followers")
        self.assertEqual(self.api("cara", "post", f"posts/{priv['id']}/like/").status_code, 404)   # can't see it, can't like it

    def test_comments_follow_the_posts_setting(self):
        p = self.make("asha", "talk")
        c = self.api("cara", "post", f"posts/{p['id']}/comments/", {"text": "nice entry"})
        self.assertEqual(c.status_code, 201)
        cid = c.json()["comment"]["id"]
        self.api("asha", "patch", f"posts/{p['id']}/", {"comments": "followers"})
        self.assertEqual(self.api("cara", "post", f"posts/{p['id']}/comments/", {"text": "again"}).status_code, 403)   # not a follower
        self.assertEqual(self.api("ben", "post", f"posts/{p['id']}/comments/", {"text": "follower here"}).status_code, 201)
        self.assertFalse(self.api("cara", "get", f"posts/{p['id']}/comments/").json()["can_comment"])
        self.api("asha", "patch", f"posts/{p['id']}/", {"comments": "off"})
        self.assertEqual(self.api("ben", "post", f"posts/{p['id']}/comments/", {"text": "x"}).status_code, 403)
        self.assertEqual(self.api("ben", "get", f"posts/{p['id']}/comments/").json()["comments"], [])
        self.api("asha", "patch", f"posts/{p['id']}/", {"comments": "everyone"})
        self.assertEqual(self.api("ben", "delete", f"posts/{p['id']}/comments/{cid}/").status_code, 403)   # not his, not his post
        self.assertEqual(self.api("asha", "delete", f"posts/{p['id']}/comments/{cid}/").status_code, 204)  # the post's author may
        self.assertEqual(len(self.api("asha", "get", f"posts/{p['id']}/comments/").json()["comments"]), 1)

    def chats(self):
        from .models import ChatGroup, ChatGroupMember, CollabMember, CollabRoom
        dm = ChatGroup.objects.create(token="dm1", name="", direct_key="ben|cara")
        ChatGroupMember.objects.create(group=dm, profile=self.people["ben"]); ChatGroupMember.objects.create(group=dm, profile=self.people["cara"])
        grp = ChatGroup.objects.create(token="g1", name="Traders")
        ChatGroupMember.objects.create(group=grp, profile=self.people["ben"])
        room = CollabRoom.objects.create(token="c1", owner=self.people["ben"], name="Gold desk", symbol="XAUUSD", interval="15min")
        CollabMember.objects.create(room=room, profile=self.people["ben"], role="owner")
        other = ChatGroup.objects.create(token="g2", name="Not Ben's")
        return dm, grp, room, other

    def test_share_post_and_profile_into_chats(self):
        from .models import ChatGroupMessage, CollabMessage
        dm, grp, room, other = self.chats()
        targets = self.api("ben", "get", "share-targets/").json()["targets"]
        self.assertEqual({(t["kind"], t["token"], t["personal"]) for t in targets}, {("group", "dm1", True), ("group", "g1", False), ("collab", "c1", False)})
        self.assertEqual(next(t["name"] for t in targets if t["token"] == "dm1"), "Chat with Cara")
        priv = self.make("asha", "for followers #plan", "followers")
        r = self.api("ben", "post", f"posts/{priv['id']}/share/", {"targets": [{"kind": "group", "token": "dm1"}, {"kind": "collab", "token": "c1"}, {"kind": "group", "token": "g2"}], "note": "look"})
        self.assertEqual((r.status_code, r.json()["sent"], r.json()["shares"]), (200, 2, 2))
        m = ChatGroupMessage.objects.get(group=dm)
        self.assertEqual((m.kind, m.attachment["type"], m.attachment["post"], m.attachment["note"]), ("share", "post", priv["id"], "look"))
        self.assertFalse(ChatGroupMessage.objects.filter(group=other).exists())   # not his chat
        self.assertEqual(CollabMessage.objects.get(room=room).attachment["type"], "post")
        # the chat shows the card
        msgs = self.c.get("/api/users/collab/cara/groups/dm1/", {"session_key": "kcara"})
        self.assertEqual(msgs.status_code, 200)
        found = [x for x in msgs.json().get("messages", []) if x.get("share")]
        self.assertEqual((len(found), found[0]["share"]["post"], found[0]["author_name"]), (1, priv["id"], "Ben"))
        # Cara got the card, but the followers-only post still isn't hers to open
        self.assertEqual(self.api("cara", "get", f"posts/{priv['id']}/").status_code, 404)
        # sharing off
        self.api("asha", "patch", f"posts/{priv['id']}/", {"allow_sharing": False})
        self.assertEqual(self.api("ben", "post", f"posts/{priv['id']}/share/", {"targets": [{"kind": "group", "token": "g1"}]}).status_code, 403)
        self.assertEqual(self.api("ben", "post", f"posts/{priv['id']}/share/", {"link": True}).status_code, 403)
        # a profile
        r = self.api("ben", "post", "people/asha_t/share/", {"targets": [{"kind": "group", "token": "g1"}]})
        self.assertEqual(r.json()["sent"], 1)
        card = ChatGroupMessage.objects.filter(group=grp).last().attachment
        self.assertEqual((card["type"], card["person"]["username"]), ("profile", "asha_t"))
        self.assertEqual(self.api("ben", "post", "people/asha_t/share/", {"targets": []}).status_code, 400)


@override_settings(POST_FILES_ROOT=TMP)
class ReelTests(PostTests):
    test_photo_reencoded_without_location = test_followers_only_posts_and_their_files = test_search = None
    test_only_its_author_edits_or_deletes = test_refused_uploads = test_avatar_and_links = None

    def test_reels_are_public_posts_starting_with_a_video(self):
        a = self.make("asha", "clip one", files=[video(), photo()])
        self.make("asha", "photo first", files=[photo(), video()])                    # starts with a photo: not a reel
        self.make("asha", "followers clip", "followers", [video()])                  # not public
        b = self.make("ben", "clip two", files=[video()])
        reels = lambda who, **q: self.api(who, "get", "reels/", q).json()
        got = reels("cara")
        self.assertEqual([r["caption"] for r in got["reels"]], ["clip two", "clip one"])
        self.assertEqual(got["reels"][0]["i_follow"], False)
        self.assertEqual([r["caption"] for r in reels("cara", start=a["id"])["reels"]], ["clip one", "clip two"])   # a shared reel first
        self.assertEqual([r["caption"] for r in reels("cara", before=b["id"])["reels"]], ["clip one"])
        self.assertIn("followers clip", [r["caption"] for r in reels("asha")["reels"]])  # your own too

    def test_views_once_per_person(self):
        a = self.make("asha", "clip", files=[video()])
        for who in ("ben", "ben", "cara", "asha"):
            r = self.api(who, "post", f"posts/{a['id']}/view/")
        self.assertEqual(r.json()["views"], 2)   # Ben once, Cara once, not its author
        self.assertEqual(self.api("cara", "get", f"posts/{a['id']}/").json()["post"]["views"], 2)
