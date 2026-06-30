import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeXquikBookmark,
  normalizeXquikBookmarks
} from "../utils/xquik-bookmarks.js";

test("normalizes Xquik records to the Twitter exporter shape", () => {
  const bookmark = normalizeXquikBookmark({
    id: "123",
    authorName: "Alice",
    authorHandle: "alice",
    fullText: "Saved launch thread",
    createdAt: "2026-06-01T00:00:00.000Z",
    likeCount: 12,
    media: [{ type: "image", url: "https://pbs.twimg.com/media/example.jpg" }]
  });

  assert.deepEqual(bookmark, {
    id: "123",
    author: "Alice",
    handle: "@alice",
    content: "Saved launch thread",
    url: "https://x.com/i/web/status/123",
    date: "2026-06-01T00:00:00.000Z",
    replies: "0",
    retweets: "0",
    likes: "12",
    views: "",
    media_type: "Image"
  });
});

test("filters empty Xquik records before export", () => {
  assert.deepEqual(normalizeXquikBookmarks([
    {},
    {
      tweetUrl: "https://x.com/bob/status/456",
      text: "Keep this"
    }
  ]), [{
    id: "https://x.com/bob/status/456",
    author: "Unknown",
    handle: "",
    content: "Keep this",
    url: "https://x.com/bob/status/456",
    date: "",
    replies: "0",
    retweets: "0",
    likes: "0",
    views: "",
    media_type: "Text"
  }]);
});
