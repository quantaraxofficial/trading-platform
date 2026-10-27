"""GitHub for scripts: a user connects their GitHub account (a personal access token they create,
with read/write access to repository contents), then pulls a Pine / Python / MQL5 file from one
of their repositories into the editor, or pushes the editor's script to a repository as a commit.

The token stays on the server, encrypted with a key derived from SECRET_KEY, and is never sent
back to the browser; every GitHub call is made from here. Every endpoint takes the caller's
user id in the path and needs one of their session keys, like the rest of the per-user API.
"""
import base64
import hashlib
import re

import requests
from cryptography.fernet import Fernet, InvalidToken
from django.conf import settings
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response

from .auth import require_session
from .models import GitHubLink

API = "https://api.github.com"
TIMEOUT = 15
MAX_FILE_BYTES = 1_000_000
# Files the editor can open: Pine Script, Python and MQL5 (sources and headers)
SCRIPT_EXTENSIONS = ('.pine', '.pinescript', '.py', '.mq5', '.mqh', '.mq4')
REPO_RE = re.compile(r'^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$')
BRANCH_RE = re.compile(r'^[A-Za-z0-9._/-]{1,200}$')


def _fernet():
    key = base64.urlsafe_b64encode(hashlib.sha256(f"github-token:{settings.SECRET_KEY}".encode()).digest())
    return Fernet(key)


def encrypt_token(token):
    return _fernet().encrypt(token.encode()).decode()


def decrypt_token(blob):
    try:
        return _fernet().decrypt(blob.encode()).decode()
    except (InvalidToken, ValueError):
        return None


class GitHubError(Exception):
    def __init__(self, message, code=status.HTTP_502_BAD_GATEWAY, extra=None):
        super().__init__(message)
        self.message, self.code, self.extra = message, code, extra or {}


def gh(token, method, path, **kwargs):
    """One GitHub REST call; GitHub's errors become a GitHubError with a readable message"""
    headers = {"Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "TradePilot-Editor"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    try:
        r = requests.request(method, API + path, headers=headers, timeout=TIMEOUT, **kwargs)
    except requests.RequestException:
        raise GitHubError("Couldn't reach GitHub. Try again in a moment.")
    if r.status_code == 401:
        raise GitHubError("GitHub didn't accept the token. It may have expired or been revoked; connect GitHub again.", status.HTTP_401_UNAUTHORIZED, {"reconnect": True})
    if r.status_code == 403 and r.headers.get('X-RateLimit-Remaining') == '0':
        raise GitHubError("GitHub's rate limit was reached. Try again in a few minutes.", status.HTTP_429_TOO_MANY_REQUESTS)
    if r.status_code >= 400:
        try:
            msg = r.json().get('message') or ''
        except ValueError:
            msg = ''
        raise GitHubError(msg or f"GitHub answered {r.status_code}", r.status_code if r.status_code in (403, 404, 409, 422) else status.HTTP_502_BAD_GATEWAY)
    return r.json() if r.content else {}


def _link_json(link):
    if not link:
        return {"connected": False}
    return {"connected": True, "login": link.login, "avatar_url": link.avatar_url, "connected_at": link.created_at.isoformat()}


def _token_of(me):
    link = GitHubLink.objects.filter(owner=me).first()
    token = link and decrypt_token(link.token)
    if not token:
        raise GitHubError("Connect your GitHub account first.", status.HTTP_400_BAD_REQUEST, {"reconnect": True})
    return token


def _repo(value):
    repo = str(value or '').strip()
    if not REPO_RE.match(repo) or any(part in ('.', '..') for part in repo.split('/')):
        raise GitHubError("Pick a repository (owner/name).", status.HTTP_400_BAD_REQUEST)
    return repo


def _branch(value, required=True):
    branch = str(value or '').strip()
    if not branch and not required:
        return ''
    if not BRANCH_RE.match(branch) or '..' in branch:
        raise GitHubError("Pick a branch.", status.HTTP_400_BAD_REQUEST)
    return branch


def _path(value):
    path = str(value or '').strip().strip('/')
    if not path or len(path) > 400 or any(part in ('', '.', '..') for part in path.split('/')):
        raise GitHubError("Give the file a path, e.g. indicators/my_script.pine", status.HTTP_400_BAD_REQUEST)
    return path


def _quote(path):
    return requests.utils.quote(path, safe='/')


def github_view(methods):
    """An endpoint: checks the session, and turns a GitHubError into its JSON answer"""
    def wrap(fn):
        @api_view(methods)
        def view(request, uid):
            me, denied = require_session(request, uid)
            if denied:
                return denied
            try:
                return fn(request, me)
            except GitHubError as e:
                return Response({"error": e.message, **e.extra}, status=e.code)
        view.__name__ = fn.__name__
        view.__doc__ = fn.__doc__
        return view
    return wrap


@github_view(['GET', 'POST', 'DELETE'])
def github_account(request, me):
    """GET: whether GitHub is connected (and as whom). POST {token}: connects it after checking
    the token with GitHub. DELETE: disconnects (forgets the token)."""
    if request.method == 'GET':
        return Response(_link_json(GitHubLink.objects.filter(owner=me).first()))
    if request.method == 'DELETE':
        GitHubLink.objects.filter(owner=me).delete()
        return Response(_link_json(None))
    token = str(request.data.get('token') or '').strip()
    if not token or len(token) > 300 or any(c.isspace() for c in token):
        return Response({"error": "Paste a GitHub personal access token"}, status=status.HTTP_400_BAD_REQUEST)
    user = gh(token, 'GET', '/user')
    link, _ = GitHubLink.objects.update_or_create(owner=me, defaults={
        "login": str(user.get('login') or '')[:100], "avatar_url": str(user.get('avatar_url') or '')[:300],
        "token": encrypt_token(token), "created_at": timezone.now(),
    })
    return Response(_link_json(link))


@github_view(['GET'])
def github_repos(request, me):
    """The repositories the token can see, most recently pushed first"""
    token = _token_of(me)
    repos = gh(token, 'GET', '/user/repos', params={"per_page": 100, "sort": "pushed", "affiliation": "owner,collaborator,organization_member"})
    return Response({"repos": [{
        "full_name": r.get('full_name'), "private": bool(r.get('private')), "default_branch": r.get('default_branch') or 'main',
        "can_push": bool((r.get('permissions') or {}).get('push')), "description": (r.get('description') or '')[:200],
    } for r in repos if isinstance(r, dict) and r.get('full_name')]})


@github_view(['GET', 'POST'])
def github_branches(request, me):
    """GET ?repo=: the repository's branches. POST {repo, name, from}: makes a new branch from
    another one (to push to)."""
    token = _token_of(me)
    if request.method == 'GET':
        repo = _repo(request.query_params.get('repo'))
        branches = gh(token, 'GET', f'/repos/{repo}/branches', params={"per_page": 100})
        return Response({"branches": [b.get('name') for b in branches if isinstance(b, dict) and b.get('name')]})
    repo = _repo(request.data.get('repo'))
    name, base = _branch(request.data.get('name')), _branch(request.data.get('from'))
    head = gh(token, 'GET', f'/repos/{repo}/git/ref/heads/{_quote(base)}')
    gh(token, 'POST', f'/repos/{repo}/git/refs', json={"ref": f"refs/heads/{name}", "sha": head['object']['sha']})
    return Response({"name": name}, status=status.HTTP_201_CREATED)


@github_view(['GET'])
def github_files(request, me):
    """?repo=&ref=: the script files in the repository at that branch (?all=1: every file)"""
    token = _token_of(me)
    repo, ref = _repo(request.query_params.get('repo')), _branch(request.query_params.get('ref'))
    show_all = request.query_params.get('all') in ('1', 'true')
    try:
        tree = gh(token, 'GET', f'/repos/{repo}/git/trees/{_quote(ref)}', params={"recursive": "1"})
    except GitHubError as e:
        if e.code == 409:   # an empty repository has no tree yet
            return Response({"files": [], "truncated": False})
        raise
    files = [{"path": t['path'], "size": t.get('size') or 0} for t in tree.get('tree', [])
             if t.get('type') == 'blob' and (show_all or t['path'].lower().endswith(SCRIPT_EXTENSIONS))]
    return Response({"files": files[:2000], "truncated": bool(tree.get('truncated')) or len(files) > 2000})


@github_view(['GET', 'PUT'])
def github_file(request, me):
    """GET ?repo=&ref=&path=: pulls a file (its text and its version, `sha`).
    PUT {repo, branch, path, content, message, sha?, force?}: pushes it as a commit. With `sha`
    (the version pulled or last pushed) GitHub refuses if the file changed since, answered as 409
    so the user can pull it or overwrite it (force: commit over whatever is there)."""
    token = _token_of(me)
    if request.method == 'GET':
        repo, ref, path = _repo(request.query_params.get('repo')), _branch(request.query_params.get('ref')), _path(request.query_params.get('path'))
        f = gh(token, 'GET', f'/repos/{repo}/contents/{_quote(path)}', params={"ref": ref})
        if not isinstance(f, dict) or f.get('type') != 'file':
            return Response({"error": "That's not a file"}, status=status.HTTP_400_BAD_REQUEST)
        if (f.get('size') or 0) > MAX_FILE_BYTES:
            return Response({"error": "The file is too big to open in the editor"}, status=status.HTTP_400_BAD_REQUEST)
        if f.get('encoding') == 'base64' and f.get('content') is not None:
            raw = base64.b64decode(f['content'])
        else:   # files over 1 MB come without content; fetch the blob
            blob = gh(token, 'GET', f"/repos/{repo}/git/blobs/{f['sha']}")
            raw = base64.b64decode(blob.get('content') or '')
        try:
            text = raw.decode('utf-8')
        except UnicodeDecodeError:
            try:
                text = raw.decode('utf-16')   # MetaEditor saves .mq5 files as UTF-16
            except UnicodeDecodeError:
                return Response({"error": "That file isn't text"}, status=status.HTTP_400_BAD_REQUEST)
        return Response({"repo": repo, "branch": ref, "path": path, "sha": f['sha'], "content": text.lstrip('﻿'), "html_url": f.get('html_url')})

    data = request.data
    repo, branch, path = _repo(data.get('repo')), _branch(data.get('branch')), _path(data.get('path'))
    content = data.get('content')
    if not isinstance(content, str) or len(content.encode()) > MAX_FILE_BYTES:
        return Response({"error": "Nothing to push, or the script is too big"}, status=status.HTTP_400_BAD_REQUEST)
    message = str(data.get('message') or '').strip()[:500] or f"Update {path.rsplit('/', 1)[-1]}"
    body = {"message": message, "content": base64.b64encode(content.encode()).decode(), "branch": branch}
    current = None
    if data.get('force') or not data.get('sha'):
        # Overwriting (or a first push, where the file may already exist): commit over the
        # version that's there now
        try:
            current = gh(token, 'GET', f'/repos/{repo}/contents/{_quote(path)}', params={"ref": branch})
        except GitHubError as e:
            if e.code != 404:
                raise
        if isinstance(current, dict) and current.get('sha'):
            if not data.get('force') and current.get('type') == 'file':
                # Pushing an unlinked script onto a file that exists: ask first
                raise GitHubError(f"{path} already exists on {branch}.", status.HTTP_409_CONFLICT, {"exists": True, "remote_sha": current['sha']})
            body["sha"] = current['sha']
    else:
        body["sha"] = str(data['sha'])
    try:
        out = gh(token, 'PUT', f'/repos/{repo}/contents/{_quote(path)}', json=body)
    except GitHubError as e:
        if e.code == 409 or (e.code == 422 and 'sha' in e.message.lower()):
            raise GitHubError(f"{path} changed on GitHub since you last pulled or pushed it.", status.HTTP_409_CONFLICT, {"changed": True})
        if e.code == 404:
            raise GitHubError("GitHub didn't find that repository or branch, or the token can't write to it.", status.HTTP_404_NOT_FOUND)
        if e.code == 403:
            raise GitHubError("The token can't write to this repository. Give it Contents: Read and write access.", status.HTTP_403_FORBIDDEN)
        raise
    commit = out.get('commit') or {}
    return Response({
        "repo": repo, "branch": branch, "path": path, "sha": (out.get('content') or {}).get('sha'),
        "html_url": (out.get('content') or {}).get('html_url'),
        "commit": {"sha": commit.get('sha'), "html_url": commit.get('html_url'), "message": message},
    })
