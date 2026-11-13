"""Where traders came from: what the browser noted on their first visit (src/app/lib/arrival.ts),
kept with their account when they sign up, sorted into a kind and a source, and the Django admin
report "Where traders came from".

Kinds: ad (a paid click: utm_medium cpc / paid…, or a Google ad click), referral (?ref= / referral /
invite code), social (from Instagram, YouTube, WhatsApp…, or a utm link marked social), search (from
Google, Bing…), email, link (a campaign link with utm_source), website (any other site), direct."""

from datetime import timedelta
from urllib.parse import urlparse

from django.db.models import Count
from django.utils import timezone

KINDS = [
    ('ad', 'Ad'), ('referral', 'Referral'), ('social', 'Social media'), ('search', 'Search'),
    ('email', 'Email'), ('link', 'Campaign link'), ('website', 'Another website'), ('direct', 'Direct'),
]
KIND_NAMES = dict(KINDS)

FIELDS = {'utm_source': 120, 'utm_medium': 120, 'utm_campaign': 120, 'utm_term': 120, 'utm_content': 120,
          'ref': 60, 'referrer': 200, 'landing': 120, 'at': 40}
PAID = {'cpc', 'ppc', 'paid', 'ad', 'ads', 'paid_social', 'paidsocial', 'paid-social', 'display', 'cpm', 'cpv', 'sponsored', 'banner'}
SOCIAL_MEDIUMS = {'social', 'social_media', 'social-media', 'sm', 'organic_social', 'post', 'story', 'reel', 'bio'}
EMAIL_MEDIUMS = {'email', 'e-mail', 'newsletter', 'mail'}
# site host -> source name
SOCIAL_SITES = {
    'instagram': 'instagram', 'facebook': 'facebook', 'fb.': 'facebook', 'youtube': 'youtube', 'youtu.be': 'youtube',
    't.co': 'twitter', 'twitter': 'twitter', 'x.com': 'twitter', 'linkedin': 'linkedin', 'lnkd.in': 'linkedin',
    'whatsapp': 'whatsapp', 'wa.me': 'whatsapp', 't.me': 'telegram', 'telegram': 'telegram', 'reddit': 'reddit',
    'discord': 'discord', 'threads.net': 'threads', 'snapchat': 'snapchat', 'pinterest': 'pinterest', 'quora': 'quora',
    'tradingview': 'tradingview',
}
SEARCH_SITES = {'google.': 'google', 'bing.': 'bing', 'duckduckgo': 'duckduckgo', 'yahoo.': 'yahoo', 'yandex': 'yandex',
                'baidu': 'baidu', 'ecosia': 'ecosia', 'brave.com': 'brave', 'chatgpt.com': 'chatgpt', 'perplexity': 'perplexity'}


def clean(raw):
    """Only the known fields, as short strings (and the two ad-click flags)"""
    if not isinstance(raw, dict):
        return None
    out = {k: str(raw[k]).strip()[:n] for k, n in FIELDS.items() if raw.get(k) not in (None, '') and isinstance(raw.get(k), (str, int, float))}
    for flag in ('gclid', 'fbclid'):
        if raw.get(flag) is True:
            out[flag] = True
    return out or None


def _site(host, table):
    host = (host or '').lower()
    for key, name in table.items():
        if key in host:
            return name
    return None


def classify(a):
    """(kind, source, campaign) of a cleaned arrival"""
    a = a or {}
    src = (a.get('utm_source') or '').lower()
    medium = (a.get('utm_medium') or '').lower()
    campaign = a.get('utm_campaign') or ''
    host = urlparse(a['referrer']).hostname if a.get('referrer') else ''
    if a.get('ref'):
        return 'referral', a['ref'], campaign
    if medium in PAID or a.get('gclid'):
        return 'ad', src or ('google' if a.get('gclid') else _site(host, SOCIAL_SITES) or _site(host, SEARCH_SITES) or 'unknown'), campaign
    if src:
        if medium in EMAIL_MEDIUMS:
            return 'email', src, campaign
        if medium in SOCIAL_MEDIUMS or _site(src, SOCIAL_SITES):
            return 'social', _site(src, SOCIAL_SITES) or src, campaign
        if medium in ('organic', 'search') or _site(src, SEARCH_SITES):
            return 'search', _site(src, SEARCH_SITES) or src, campaign
        return 'link', src, campaign
    if a.get('fbclid'):
        return 'social', 'facebook', campaign
    if host:
        if _site(host, SEARCH_SITES):
            return 'search', _site(host, SEARCH_SITES), ''
        if _site(host, SOCIAL_SITES):
            return 'social', _site(host, SOCIAL_SITES), ''
        return 'website', host[4:] if host.startswith('www.') else host, ''
    return 'direct', '', ''


def record(profile, raw):
    """Keeps where a new trader came from with their account (from their sign-up)"""
    a = clean(raw)
    if a is None:
        return  # (nothing sent: not known, rather than "direct")
    kind, source, campaign = classify(a)
    profile.source_kind, profile.source, profile.campaign, profile.arrival = kind, source[:80], campaign[:120], a
    profile.save(update_fields=['source_kind', 'source', 'campaign', 'arrival'])


def label(profile):
    """"Ad · instagram", "Referral · RAHUL10", "Direct"; '' when it wasn't recorded (signed up before)"""
    if not profile.source_kind:
        return ''
    name = KIND_NAMES.get(profile.source_kind, profile.source_kind)
    return f'{name} · {profile.source}' if profile.source else name


def report():
    """The admin page: sign-ups by kind for this month / this year / all time, by source and
    campaign, and the latest sign-ups with where each came from"""
    from .models import TraderProfile
    from .presence import IST
    now = timezone.now().astimezone(IST)
    month = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    year = month.replace(month=1)
    periods = [('30d', 'Last 30 days', now - timedelta(days=30)), ('month', 'This month', month), ('year', 'This year', year), ('all', 'All time', None)]
    qs = TraderProfile.objects.all()

    def counts(by):
        out = {}
        for key, _, since in periods:
            q = qs.filter(created_at__gte=since) if since else qs
            for row in q.values(*by).annotate(n=Count('id')):
                out.setdefault(tuple(row[b] for b in by), {})[key] = row['n']
        return out

    by_kind = counts(['source_kind'])
    cards = []
    for kind, name in KINDS + [('', 'Not recorded')]:
        c = by_kind.get((kind,), {})
        if c or kind:
            cards.append({'kind': kind, 'label': name, 'cells': [c.get(k, 0) for k, _, _ in periods]})
    totals = [sum(c['cells'][i] for c in cards) for i in range(len(periods))]

    sources = []
    for (kind, source, campaign), c in counts(['source_kind', 'source', 'campaign']).items():
        if not kind:
            continue
        sources.append({'kind': KIND_NAMES.get(kind, kind), 'source': source or '—', 'campaign': campaign or '—',
                        'cells': [c.get(k, 0) for k, _, _ in periods], 'all': c.get('all', 0)})
    sources.sort(key=lambda r: (-r['cells'][0], -r['all'], r['kind'], r['source']))

    latest = []
    for p in qs.order_by('-created_at')[:30]:
        a = p.arrival or {}
        latest.append({'id': p.id, 'name': p.name, 'email': p.email, 'created_at': p.created_at, 'came_from': label(p) or 'Not recorded',
                       'campaign': p.campaign, 'referrer': a.get('referrer', ''), 'landing': a.get('landing', '')})
    return {'periods': [(k, l) for k, l, _ in periods], 'cards': cards, 'totals': totals, 'sources': sources, 'latest': latest}
