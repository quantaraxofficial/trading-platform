"""Request limits per caller (by IP: the site's API has no DRF users), against password-spraying
sign-ins, report / feedback floods that fill the disk, and scripted abuse. The rates are in
settings.REST_FRAMEWORK['DEFAULT_THROTTLE_RATES']; behind a proxy, TRUSTED_PROXY_COUNT says how
many X-Forwarded-For hops to trust, so the header can't be forged to dodge them."""
from rest_framework.throttling import SimpleRateThrottle


class _ByIp(SimpleRateThrottle):
    def get_cache_key(self, request, view):
        return self.cache_format % {'scope': self.scope, 'ident': self.get_ident(request)}


class SignInThrottle(_ByIp):
    scope = 'signin'


class ReportThrottle(_ByIp):
    scope = 'report'


class FeedbackThrottle(_ByIp):
    scope = 'feedback'


class UploadThrottle(_ByIp):
    scope = 'upload'


class ApiThrottle(_ByIp):
    """Everything else: generous, only stops floods"""
    scope = 'api'
