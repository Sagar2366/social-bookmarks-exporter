function cleanText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function cleanMetric(value) {
  if (typeof value === "number") {
    return String(value);
  }

  return cleanText(value) || "0";
}

function cleanHandle(value) {
  const handle = cleanText(value);
  if (!handle) {
    return "";
  }

  return handle.startsWith("@") ? handle : `@${handle}`;
}

function mediaType(record) {
  const media = Array.isArray(record.media) ? record.media : [];
  if (media.some((item) => item?.type === "video")) {
    return "Video";
  }

  if (media.some((item) => item?.type === "image") || Array.isArray(record.imageUrls) && record.imageUrls.length > 0) {
    return "Image";
  }

  return record.linkCard?.url ? "Link" : "Text";
}

export function normalizeXquikBookmark(record) {
  const author = record.author ?? {};
  const user = record.user ?? {};
  const id = cleanText(record.id ?? record.tweetId);
  const url = cleanText(record.url ?? record.tweetUrl ?? record.permalink) ||
    (id ? `https://x.com/i/web/status/${id}` : "");

  return {
    id: id || url || cleanText(record.text).slice(0, 100),
    author: cleanText(record.authorName ?? record.author_name ?? author.name ?? user.name) || "Unknown",
    handle: cleanHandle(record.authorHandle ?? record.author_handle ?? author.username ?? user.username),
    content: cleanText(record.text ?? record.fullText ?? record.full_text ?? record.content).slice(0, 5000),
    url,
    date: cleanText(record.createdAt ?? record.postedAt ?? record.date),
    replies: cleanMetric(record.replyCount ?? record.replies),
    retweets: cleanMetric(record.retweetCount ?? record.retweets),
    likes: cleanMetric(record.likeCount ?? record.likes),
    views: cleanText(record.viewCount ?? record.views),
    media_type: mediaType(record)
  };
}

export function normalizeXquikBookmarks(records) {
  return records
    .map(normalizeXquikBookmark)
    .filter((bookmark) => bookmark.url || bookmark.content);
}
