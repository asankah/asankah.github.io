// Bluesky-backed comments.
//
// A comment is a reply to a Bluesky post. Nothing is stored on this site and
// there is no endpoint here that accepts a write, so there is no spam queue to
// keep up with -- moderation happens on Bluesky, or in the denylist baked into
// `content/_data/comments.yaml` at build time.
//
// The thread is fetched from the unauthenticated public AppView, in the
// browser, and only after the reader presses the button. Until then this page
// makes no request to Bluesky at all.
(function () {
  "use strict";

  var POST_COLLECTION = "app.bsky.feed.post";

  // ---------------------------------------------------------------- helpers

  // `https://bsky.app/profile/<handle-or-did>/post/<rkey>` -> the AT-URI the
  // API wants. The AppView resolves a handle in the authority position, so no
  // separate identity lookup is needed. An `at://` URI is passed through.
  function toAtUri(url) {
    if (typeof url !== "string") return null;
    if (url.indexOf("at://") === 0) return url;
    var match = url.match(
      /^https?:\/\/bsky\.app\/profile\/([^/?#]+)\/post\/([^/?#]+)/
    );
    if (!match) return null;
    return (
      "at://" +
      decodeURIComponent(match[1]) +
      "/" +
      POST_COLLECTION +
      "/" +
      decodeURIComponent(match[2])
    );
  }

  // The inverse, for permalinks back into Bluesky.
  function toWebUrl(atUri) {
    var match = /^at:\/\/([^/]+)\/[^/]+\/([^/]+)$/.exec(atUri || "");
    if (!match) return null;
    return (
      "https://bsky.app/profile/" +
      encodeURIComponent(match[1]) +
      "/post/" +
      encodeURIComponent(match[2])
    );
  }

  function isHttpUrl(value) {
    if (typeof value !== "string") return false;
    try {
      var parsed = new URL(value);
      return parsed.protocol === "http:" || parsed.protocol === "https:";
    } catch (error) {
      return false;
    }
  }

  function element(tag, className) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    return node;
  }

  var RELATIVE_UNITS = [
    ["year", 31536000],
    ["month", 2592000],
    ["week", 604800],
    ["day", 86400],
    ["hour", 3600],
    ["minute", 60],
  ];

  function relativeTime(iso) {
    var then = Date.parse(iso);
    if (isNaN(then)) return "";
    var seconds = Math.round((then - Date.now()) / 1000);
    var magnitude = Math.abs(seconds);
    for (var i = 0; i < RELATIVE_UNITS.length; i++) {
      var name = RELATIVE_UNITS[i][0];
      var size = RELATIVE_UNITS[i][1];
      if (magnitude >= size) {
        return new Intl.RelativeTimeFormat(undefined, {
          numeric: "auto",
        }).format(Math.round(seconds / size), name);
      }
    }
    return "just now";
  }

  // ------------------------------------------------------------- rich text

  // Facet ranges are byte offsets into the UTF-8 encoding of the text, not
  // JavaScript string indices, so the text is sliced as bytes. Getting this
  // wrong misplaces every link in any post containing an emoji or a non-ASCII
  // character -- which, on this blog, is most of them.
  function richText(record) {
    var text = record && typeof record.text === "string" ? record.text : "";
    var fragment = document.createDocumentFragment();
    var bytes = new TextEncoder().encode(text);
    var decoder = new TextDecoder();

    function slice(start, end) {
      return decoder.decode(bytes.subarray(start, end));
    }

    var facets = (Array.isArray(record && record.facets) ? record.facets : [])
      .filter(function (facet) {
        var index = facet && facet.index;
        return (
          index &&
          Number.isInteger(index.byteStart) &&
          Number.isInteger(index.byteEnd) &&
          index.byteStart >= 0 &&
          index.byteEnd > index.byteStart &&
          index.byteEnd <= bytes.length
        );
      })
      .sort(function (a, b) {
        return a.index.byteStart - b.index.byteStart;
      });

    var cursor = 0;
    facets.forEach(function (facet) {
      if (facet.index.byteStart < cursor) return; // overlapping range
      if (facet.index.byteStart > cursor) {
        fragment.appendChild(
          document.createTextNode(slice(cursor, facet.index.byteStart))
        );
      }
      fragment.appendChild(
        facetNode(facet, slice(facet.index.byteStart, facet.index.byteEnd))
      );
      cursor = facet.index.byteEnd;
    });
    if (cursor < bytes.length) {
      fragment.appendChild(
        document.createTextNode(slice(cursor, bytes.length))
      );
    }
    return fragment;
  }

  function facetNode(facet, label) {
    var features = Array.isArray(facet.features) ? facet.features : [];
    for (var i = 0; i < features.length; i++) {
      var feature = features[i] || {};
      var type = typeof feature.$type === "string" ? feature.$type : "";
      var href = null;
      if (type.indexOf("#link") !== -1 && isHttpUrl(feature.uri)) {
        href = feature.uri;
      } else if (
        type.indexOf("#mention") !== -1 &&
        typeof feature.did === "string"
      ) {
        href = "https://bsky.app/profile/" + encodeURIComponent(feature.did);
      } else if (
        type.indexOf("#tag") !== -1 &&
        typeof feature.tag === "string"
      ) {
        href = "https://bsky.app/hashtag/" + encodeURIComponent(feature.tag);
      }
      if (href) {
        var anchor = element("a");
        anchor.href = href;
        anchor.textContent = label;
        // Someone else's words, someone else's links.
        anchor.rel = "nofollow ugc noopener";
        return anchor;
      }
    }
    return document.createTextNode(label);
  }

  // ------------------------------------------------------------ moderation

  // Three independent gates, cheapest first. A reply that fails any of them is
  // dropped along with everything nested under it.
  function isVisible(post, context) {
    if (!post || typeof post.uri !== "string") return false;
    if (context.hiddenReplies.has(post.uri)) return false; // hidden on Bluesky
    if (context.blockedPosts.has(post.uri)) return false; // local denylist
    var author = post.author || {};
    if (author.did && context.blockedDids.has(author.did)) return false;
    var labels = (post.labels || []).concat(author.labels || []);
    for (var i = 0; i < labels.length; i++) {
      if (labels[i] && context.hideLabels.has(labels[i].val)) return false;
    }
    return true;
  }

  // Depth-first walk of the reply tree, flattened into a list. Anything deeper
  // than maxDepth keeps rendering, at the deepest indent, rather than
  // disappearing.
  function collect(node, depth, context, out) {
    if (!node || typeof node !== "object") return;
    var type = typeof node.$type === "string" ? node.$type : "";
    // A deleted or block-obscured reply. Its children are unreachable too.
    if (type.indexOf("#notFoundPost") !== -1) return;
    if (type.indexOf("#blockedPost") !== -1) return;

    var post = node.post;
    if (!isVisible(post, context)) return;
    out.push({ post: post, depth: depth });

    var replies = Array.isArray(node.replies) ? node.replies.slice() : [];
    replies.sort(function (a, b) {
      var left = Date.parse((a && a.post && a.post.indexedAt) || "") || 0;
      var right = Date.parse((b && b.post && b.post.indexedAt) || "") || 0;
      return left - right;
    });
    var next = Math.min(depth + 1, context.maxDepth);
    replies.forEach(function (reply) {
      collect(reply, next, context, out);
    });
  }

  // --------------------------------------------------------------- rendering

  function renderComment(entry) {
    var post = entry.post;
    var author = post.author || {};
    var permalink = toWebUrl(post.uri);

    var article = element("article", "comment");
    article.style.setProperty("--comment-depth", String(entry.depth));

    var header = element("header", "comment-header");

    var byline = element("a", "comment-author");
    byline.href =
      "https://bsky.app/profile/" + encodeURIComponent(author.did || "");
    byline.rel = "nofollow ugc noopener";

    if (isHttpUrl(author.avatar)) {
      var avatar = element("img", "comment-avatar");
      avatar.src = author.avatar;
      avatar.alt = "";
      avatar.width = 32;
      avatar.height = 32;
      avatar.loading = "lazy";
      byline.appendChild(avatar);
    }

    var name = element("span", "comment-name");
    name.textContent = author.displayName || author.handle || "someone";
    byline.appendChild(name);

    if (author.handle) {
      var handle = element("span", "comment-handle");
      handle.textContent = "@" + author.handle;
      byline.appendChild(handle);
    }
    header.appendChild(byline);

    if (permalink && post.indexedAt) {
      var stamp = element("a", "comment-stamp");
      stamp.href = permalink;
      stamp.rel = "nofollow ugc noopener";
      var time = element("time");
      time.dateTime = post.indexedAt;
      time.textContent = relativeTime(post.indexedAt);
      time.title = new Date(post.indexedAt).toLocaleString();
      stamp.appendChild(time);
      header.appendChild(stamp);
    }
    article.appendChild(header);

    var body = element("div", "comment-body");
    body.appendChild(richText(post.record));
    article.appendChild(body);

    if (post.likeCount > 0) {
      var likes = element("p", "comment-likes");
      likes.textContent =
        post.likeCount + (post.likeCount === 1 ? " like" : " likes");
      article.appendChild(likes);
    }
    return article;
  }

  function renderMessage(container, text) {
    container.replaceChildren();
    var paragraph = element("p", "comments-message");
    paragraph.textContent = text;
    container.appendChild(paragraph);
  }

  // ------------------------------------------------------------------ load

  function readConfig(section) {
    var defaults = { hideLabels: [], blockedDids: [], blockedPosts: [] };
    var script = section.querySelector(".comments-config");
    var parsed = defaults;
    if (script) {
      try {
        parsed = JSON.parse(script.textContent) || defaults;
      } catch (error) {
        parsed = defaults;
      }
    }
    var depth = parseInt(section.dataset.bskyMaxDepth, 10);
    return {
      service: section.dataset.bskyService || "https://public.api.bsky.app",
      maxDepth: depth > 0 && depth <= 10 ? depth : 4,
      hideLabels: new Set(parsed.hideLabels || []),
      blockedDids: new Set(parsed.blockedDids || []),
      blockedPosts: new Set(parsed.blockedPosts || []),
      hiddenReplies: new Set(),
    };
  }

  async function load(section) {
    var thread = section.querySelector(".comments-thread");
    var intro = section.querySelector(".comments-intro");
    var context = readConfig(section);
    var atUri = toAtUri(section.dataset.bskyThread);

    thread.hidden = false;
    renderMessage(thread, "Loading comments…");

    if (!atUri) {
      renderMessage(thread, "This post’s discussion link is malformed.");
      return;
    }

    var endpoint =
      context.service +
      "/xrpc/app.bsky.feed.getPostThread?uri=" +
      encodeURIComponent(atUri) +
      "&depth=" +
      context.maxDepth +
      "&parentHeight=0";

    var payload;
    try {
      var response = await fetch(endpoint, { headers: { Accept: "*/*" } });
      if (!response.ok) throw new Error("HTTP " + response.status);
      payload = await response.json();
    } catch (error) {
      renderMessage(
        thread,
        "Couldn’t reach Bluesky just now. The thread is still readable there."
      );
      return;
    }

    var root = payload && payload.thread;
    if (!root || !root.post) {
      renderMessage(thread, "That Bluesky thread is no longer available.");
      return;
    }

    // The author's own "hide reply" decisions travel with the root post. This
    // is what makes hiding a reply on Bluesky hide it here too.
    var gate = root.post.threadgate;
    var hidden = gate && gate.record && gate.record.hiddenReplies;
    if (Array.isArray(hidden)) {
      hidden.forEach(function (uri) {
        context.hiddenReplies.add(uri);
      });
    }

    var entries = [];
    var replies = Array.isArray(root.replies) ? root.replies.slice() : [];
    replies.sort(function (a, b) {
      var left = Date.parse((a && a.post && a.post.indexedAt) || "") || 0;
      var right = Date.parse((b && b.post && b.post.indexedAt) || "") || 0;
      return left - right;
    });
    replies.forEach(function (reply) {
      collect(reply, 0, context, entries);
    });

    thread.replaceChildren();
    if (!entries.length) {
      renderMessage(thread, "No comments yet.");
    } else {
      var count = element("p", "comments-count");
      count.textContent =
        entries.length + (entries.length === 1 ? " comment" : " comments");
      thread.appendChild(count);
      entries.forEach(function (entry) {
        thread.appendChild(renderComment(entry));
      });
    }

    if (intro) intro.hidden = true;
    thread.setAttribute("tabindex", "-1");
    thread.focus({ preventScroll: true });
  }

  function init() {
    document.querySelectorAll(".comments[data-bsky-thread]").forEach(
      function (section) {
        var button = section.querySelector(".comments-load");
        if (!button) return;
        button.hidden = false; // only now is it something that works
        button.addEventListener("click", function () {
          button.disabled = true;
          button.textContent = "Loading…";
          load(section).finally(function () {
            button.disabled = false;
            button.textContent = "Load comments from Bluesky";
          });
        });
      }
    );
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();