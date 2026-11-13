"use client";

// A post or someone's profile shared in a chat (backend core/posts.py: personal, group and collab
// chats), as a card that opens it. A post's picture loads only for someone allowed to see the post:
// a followers-only post shows "Followers only" to anyone else.

import React, { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import type { ChatShare } from "../../lib/collab/session";
import { avatarSrc, mediaUrl, postUrl, profileUrl, initials } from "../../community/social";

function Face({ name, avatar, size = 28 }: { name: string; avatar?: string; size?: number }) {
  return avatar
    ? <img src={avatarSrc(avatar)} alt="" className="tv-co-share-face" style={{ width: size, height: size }} />
    : <span className="tv-co-share-face tv-co-share-initials" style={{ width: size, height: size, fontSize: size * 0.4 }}>{initials(name)}</span>;
}

export default function ShareCard({ s }: { s: ChatShare }) {
  const { user } = useAuth();
  const [hidden, setHidden] = useState(false);
  if (s.type === "profile") {
    const p = s.person;
    return (
      <div className="tv-co-share" data-name="chat-share" data-kind="profile">
        {s.note && <div className="tv-co-share-note">{s.note}</div>}
        <a href={profileUrl(p.username)} target="_blank" rel="noreferrer" className="tv-co-share-profile">
          <Face name={p.name} avatar={p.avatar} size={40} />
          <span className="tv-co-share-who"><b>{p.name}</b><span>@{p.username} · {s.followers} follower{s.followers === 1 ? "" : "s"} · {s.posts} post{s.posts === 1 ? "" : "s"}</span></span>
        </a>
        {p.bio && <div className="tv-co-share-caption">{p.bio}</div>}
        <a href={profileUrl(p.username)} target="_blank" rel="noreferrer" className="tv-co-share-open">View profile</a>
      </div>
    );
  }
  const m = s.media;
  return (
    <div className="tv-co-share" data-name="chat-share" data-kind="post">
      {s.note && <div className="tv-co-share-note">{s.note}</div>}
      <div className="tv-co-share-head"><Face name={s.author.name} avatar={s.author.avatar} /><span>Post by <b>{s.author.name}</b></span></div>
      {m && user && (hidden
        ? <div className="tv-co-share-locked">{s.visibility === "followers" ? `Followers only: follow @${s.author.username} to see it` : "This post isn't there any more"}</div>
        : <a href={postUrl(s.post)} target="_blank" rel="noreferrer" className="tv-co-share-media">
          {m.kind === "video"
            ? <video src={`${mediaUrl(user.uid, s.post, m.id)}#t=0.1`} muted playsInline preload="metadata" onError={() => setHidden(true)} />
            : <img src={mediaUrl(user.uid, s.post, m.id)} alt="" onError={() => setHidden(true)} />}
          {s.count > 1 && <span className="tv-co-share-count">1 / {s.count}</span>}
        </a>)}
      {s.caption && <div className="tv-co-share-caption">{s.caption}</div>}
      <a href={postUrl(s.post)} target="_blank" rel="noreferrer" className="tv-co-share-open">Open post</a>
    </div>
  );
}
