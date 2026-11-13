"use client";

// A post on its own page (/p/<id>: the link "Share → Copy link" gives, and where notifications and
// chat cards lead). Seen only by people allowed to see it.

import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Card, Empty } from "../analytics/ui";
import CommunityShell from "./CommunityShell";
import { PostDetail } from "./Posts";
import { getPost, profileUrl, type Post } from "./social";

export default function PostPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params?.id);
  return (
    <CommunityShell title="Post" active="other">
      {uid => <PostBody uid={uid} id={id} />}
    </CommunityShell>
  );
}

function PostBody({ uid, id }: { uid: string; id: number }) {
  const [post, setPost] = useState<Post | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [gone, setGone] = useState<string | null>(null);
  useEffect(() => { getPost(uid, id).then(setPost, e => setError(e.message)); }, [uid, id]);
  // (deleted here: on to its author's profile)
  useEffect(() => { if (gone) window.location.href = profileUrl(gone); }, [gone]);
  if (gone) return null;
  if (error) return <Card><Empty>{error}</Empty></Card>;
  if (!post) return <Card><Empty>Loading…</Empty></Card>;
  return <PostDetail uid={uid} post={post} inline onChange={setPost} onDeleted={() => setGone(post.author.username)} />;
}
