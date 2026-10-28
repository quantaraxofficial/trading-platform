"""Paid access, sold by hand: you take the payment, then create the account in Django admin
(Traders → Create account: name, email, months). The site makes its sign-in (Firebase email and a
generated password, shown to you once to send to the buyer) and the subscription. When the
subscription's time is up the account still signs in and works, but the features marked locked
(Locked features in admin: collab, bar replay…) are refused, with your renew message.

Firebase accounts are made through Firebase's own sign-up service with the site's web API key (the
same public key the sign-in page uses), so no service-account file is needed.
"""
import secrets
import string
from datetime import timedelta

import requests
from django.conf import settings
from django.utils import timezone

from .models import LockedFeature, PlanSettings, Subscription

IDENTITY = "https://identitytoolkit.googleapis.com/v1"


# ---------------------------------------------------------------- access

def access_until(profile):
    s = Subscription.objects.filter(profile=profile).order_by('-ends_at').first()
    return s.ends_at if s else None


def access_of(profile):
    """{active, until (ms), days_left, locked: [feature keys locked for this person now],
    features: {key: label} of everything a subscription is needed for (so the page can lock them
    itself when the time runs out while it's open), message}"""
    until = access_until(profile)
    now = timezone.now()
    active = bool(until and until > now)
    features = dict(LockedFeature.objects.filter(locked=True).values_list('key', 'label'))
    days_left = max(0, (until - now).days + (1 if (until - now).seconds else 0)) if active else 0
    plan = PlanSettings.objects.first()
    return {"active": active, "until": int(until.timestamp() * 1000) if until else None, "days_left": days_left,
            "locked": [] if active else list(features), "features": features,
            "message": plan.renew_message if plan else "Your subscription has ended."}


def is_locked(profile, key):
    return key in access_of(profile)["locked"]


def locked_response(profile, key):
    """The answer for a locked feature (402), or None when it's open to them"""
    from rest_framework import status
    from rest_framework.response import Response
    if not is_locked(profile, key):
        return None
    f = LockedFeature.objects.filter(key=key).first()
    a = access_of(profile)
    return Response({"error": f"{f.label if f else key} needs an active subscription. {a['message']}", "locked": key, "access": a},
                    status=status.HTTP_402_PAYMENT_REQUIRED)


def extend(profile, months=0, days=0, amount='', note=''):
    """Adds time after whatever's left (or from now, once it's ended); returns the new subscription"""
    now = timezone.now()
    current = access_until(profile)
    start = current if current and current > now else now
    end = start + timedelta(days=30 * months + days)
    return Subscription.objects.create(profile=profile, starts_at=start, ends_at=end, months=months, days=days, amount=amount, note=note)


def end_now(profile):
    """Ends access at once (the subscriptions stay, for the record)"""
    now = timezone.now()
    Subscription.objects.filter(profile=profile, ends_at__gt=now).update(ends_at=now)


# ---------------------------------------------------------------- Firebase sign-in accounts

class FirebaseError(Exception):
    pass


def _api_key():
    key = getattr(settings, 'FIREBASE_WEB_API_KEY', '')
    if not key:
        raise FirebaseError("Set FIREBASE_WEB_API_KEY (the web app's apiKey from src/lib/firebase.ts) to create accounts from admin")
    return key


def _post(path, body):
    r = requests.post(f"{IDENTITY}/{path}?key={_api_key()}", json=body, timeout=20)
    data = r.json() if r.content else {}
    if r.status_code != 200:
        code = ((data.get('error') or {}).get('message') or str(r.status_code)).split(' ')[0]
        raise FirebaseError({
            "EMAIL_EXISTS": "An account with this email already exists: extend its subscription instead",
            "INVALID_EMAIL": "That email isn't valid",
            "OPERATION_NOT_ALLOWED": "Email/password sign-in is turned off in the Firebase console",
            "EMAIL_NOT_FOUND": "No sign-in account has this email",
            "TOO_MANY_ATTEMPTS_TRY_LATER": "Firebase is limiting requests: try again in a few minutes",
        }.get(code, f"Firebase refused it ({code})"))
    return data


def new_password(length=12):
    """Easy to read out and type: no 0/O, 1/l/I"""
    alphabet = "".join(c for c in string.ascii_letters + string.digits if c not in "0O1lI")
    while True:
        p = "".join(secrets.choice(alphabet) for _ in range(length))
        if any(c.isdigit() for c in p) and any(c.isupper() for c in p) and any(c.islower() for c in p):
            return p


def create_login(email, password, name):
    """A Firebase email/password account, its display name set; its uid back"""
    data = _post("accounts:signUp", {"email": email, "password": password, "returnSecureToken": True})
    try:
        _post("accounts:update", {"idToken": data["idToken"], "displayName": name, "returnSecureToken": False})
    except FirebaseError:
        pass   # the name is kept in the profile anyway
    return data["localId"]


def send_password_reset(email):
    """Firebase emails them a link to set a new password"""
    _post("accounts:sendOobCode", {"requestType": "PASSWORD_RESET", "email": email})
