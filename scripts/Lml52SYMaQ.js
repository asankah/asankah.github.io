// Reader reactions.
//
// Three marks against the post, and -- when the reader selects a passage --
// the same three against the paragraph containing it. Counts live in the
// service under `reactions/`; the ids come from `data-anchor`, which
// lib/anchors.ts derives from each block's own text.
//
// Selection is what raises the paragraph controls, rather than a permanent
// affordance on every paragraph. A control per paragraph would put three tab
// stops between a keyboard reader and the next sentence, and a hover-only
// affordance would not exist at all on a phone. Selecting text works with a
// mouse, a long-press, and Shift+Arrow alike.
(function () {
  "use strict";

  var VISITOR_KEY = "blog.reactions.visitor";
  var SELECTION_MIN = 2;

  // ---------------------------------------------------------------- visitor

  // A random id, kept in this browser, that lets the service recognise a
  // second tap on the same button as "undo" rather than "+1". It is not an
  // account and identifies nobody: clearing site data gets a new one, and the
  // reactions already recorded under the old one simply stop being
  // attributable. Storage can throw (private windows, blocked site data), in
  // which case reactions still work and just are not undoable.
  function visitorId() {
    var existing = null;
    try {
      existing = window.localStorage.getItem(VISITOR_KEY);
    } catch (error) {
      existing = null;
    }
    if (existing && /^[A-Za-z0-9_-]{16,64}$/.test(existing)) return existing;

    var bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    var id = btoa(String.fromCharCode.apply(null, bytes))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    try {
      window.localStorage.setItem(VISITOR_KEY, id);
    } catch (error) {
      /* fine: this reader just gets a fresh id next page */
    }
    return id;
  }

  // ------------------------------------------------------------------- api

  function Api(endpoint, page, visitor) {
    this.endpoint = endpoint;
    this.page = page;
    this.visitor = visitor;
  }

  Api.prototype.read = async function () {
    var url =
      this.endpoint +
      "?page=" +
      encodeURIComponent(this.page) +
      "&visitor=" +
      encodeURIComponent(this.visitor);
    var response = await fetch(url, { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error("HTTP " + response.status);
    return response.json();
  };

  Api.prototype.toggle = async function (anchor, kind) {
    var response = await fetch(this.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        page: this.page,
        anchor: anchor,
        kind: kind,
        visitor: this.visitor,
      }),
    });
    if (!response.ok) throw new Error("HTTP " + response.status);
    return response.json();
  };

  // ---------------------------------------------------------------- widget

  function Reactions(root) {
    this.root = root;
    this.page = root.dataset.reactionsPage || location.pathname;
    this.api = new Api(root.dataset.reactionsEndpoint, this.page, visitorId());
    this.perParagraph = root.dataset.reactionsParagraphs === "1";
    this.kinds = this.readKinds();
    this.totals = {};
    this.mine = {};
    this.bar = null;
    this.barAnchor = null;
  }

  Reactions.prototype.readKinds = function () {
    var script = this.root.querySelector(".reactions-kinds");
    try {
      return JSON.parse(script.textContent) || [];
    } catch (error) {
      return [];
    }
  };

  Reactions.prototype.countFor = function (anchor, kind) {
    var counts = this.totals[anchor];
    return (counts && counts[kind]) || 0;
  };

  Reactions.prototype.isMine = function (anchor, kind) {
    var mine = this.mine[anchor];
    return !!mine && mine.indexOf(kind) !== -1;
  };

  Reactions.prototype.absorb = function (state) {
    this.totals = (state && state.totals) || {};
    this.mine = (state && state.mine) || {};
    this.paint();
  };

  // Repaints every button on the page from the current totals.
  Reactions.prototype.paint = function () {
    var self = this;
    document.querySelectorAll(".reaction[data-kind]").forEach(function (button) {
      var anchor = button.closest("[data-reaction-anchor]");
      var key = anchor ? anchor.dataset.reactionAnchor : "";
      var kind = button.dataset.kind;
      var count = self.countFor(key, kind);
      var mine = self.isMine(key, kind);

      var label = button.querySelector(".reaction-label");
      var counter = button.querySelector(".reaction-count");
      if (counter) {
        counter.textContent = count > 0 ? String(count) : "";
        counter.hidden = count === 0;
      }
      button.setAttribute("aria-pressed", mine ? "true" : "false");
      button.classList.toggle("is-mine", mine);
      // The visible label is the mark and the word; the accessible name has to
      // carry the tally too, since the count is a separate span.
      var words = label ? label.textContent.trim() : kind;
      button.setAttribute(
        "aria-label",
        count > 0 ? words + ", " + count : words
      );
    });
    this.paintParagraphMarks();
  };

  // A paragraph that has collected reactions shows them in the left margin --
  // the right one belongs to sidenotes. These are readouts, not controls: no
  // tab stop, nothing to click.
  Reactions.prototype.paintParagraphMarks = function () {
    if (!this.perParagraph) return;
    var self = this;
    document.querySelectorAll("article main [data-anchor]").forEach(function (block) {
      // A <span> is only legal inside a block that takes flow content; a list
      // or a table would have to hang it outside itself, which is more
      // trouble than the readout is worth.
      var tag = block.tagName;
      if (tag !== "P" && tag !== "BLOCKQUOTE") return;
      var anchor = block.dataset.anchor;
      var counts = self.totals[anchor];
      var total = 0;
      var parts = [];
      self.kinds.forEach(function (entry) {
        var n = (counts && counts[entry.kind]) || 0;
        if (n > 0) {
          total += n;
          parts.push(entry.mark + " " + n);
        }
      });

      var existing = block.querySelector(":scope > .paragraph-marks");
      if (total === 0) {
        if (existing) existing.remove();
        return;
      }
      var marks = existing;
      if (!marks) {
        marks = document.createElement("span");
        marks.className = "paragraph-marks";
        marks.setAttribute("aria-hidden", "true");
        block.appendChild(marks);
      }
      marks.textContent = parts.join("  ");
    });
  };

  Reactions.prototype.toggle = async function (anchor, kind, button) {
    button.disabled = true;
    try {
      this.absorb(await this.api.toggle(anchor, kind));
    } catch (error) {
      this.fail();
    } finally {
      button.disabled = false;
    }
  };

  Reactions.prototype.fail = function () {
    if (this.root.querySelector(".reactions-error")) return;
    var note = document.createElement("p");
    note.className = "reactions-error";
    note.textContent = "Couldn’t record that just now.";
    this.root.appendChild(note);
    setTimeout(function () {
      note.remove();
    }, 4000);
  };

  // ------------------------------------------------------- selection bar

  Reactions.prototype.buildBar = function () {
    var self = this;
    var bar = document.createElement("div");
    bar.className = "reaction-bar";
    bar.setAttribute("role", "group");
    bar.setAttribute("aria-label", "React to the selected passage");
    bar.hidden = true;

    this.kinds.forEach(function (entry) {
      var button = document.createElement("button");
      button.type = "button";
      button.className = "reaction reaction-small";
      button.dataset.kind = entry.kind;
      button.setAttribute("aria-pressed", "false");
      button.title = entry.label;

      var mark = document.createElement("span");
      mark.className = "reaction-mark";
      mark.setAttribute("aria-hidden", "true");
      mark.textContent = entry.mark;
      button.appendChild(mark);

      var label = document.createElement("span");
      label.className = "reaction-label sr-only";
      label.textContent = entry.label;
      button.appendChild(label);

      var count = document.createElement("span");
      count.className = "reaction-count";
      count.hidden = true;
      button.appendChild(count);

      button.addEventListener("mousedown", function (event) {
        // Keep the selection alive through the click.
        event.preventDefault();
      });
      button.addEventListener("click", function () {
        if (self.barAnchor) self.toggle(self.barAnchor, entry.kind, button);
      });
      bar.appendChild(button);
    });

    // Parked at the end of the document until a selection moves it next to
    // the passage it belongs to; see showBarForSelection.
    document.body.appendChild(bar);
    return bar;
  };

  Reactions.prototype.hideBar = function () {
    if (this.bar) this.bar.hidden = true;
    this.barAnchor = null;
  };

  Reactions.prototype.showBarForSelection = function () {
    var selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.rangeCount) {
      return this.hideBar();
    }
    if (selection.toString().trim().length < SELECTION_MIN) {
      return this.hideBar();
    }

    var range = selection.getRangeAt(0);
    var node = range.commonAncestorContainer;
    if (node.nodeType === Node.TEXT_NODE) node = node.parentNode;
    var block = node && node.closest ? node.closest("[data-anchor]") : null;
    if (!block || !block.closest("article main")) return this.hideBar();

    if (!this.bar) this.bar = this.buildBar();
    this.barAnchor = block.dataset.anchor;

    // Sit the bar immediately after the passage in the document, so Tab from
    // the passage reaches it rather than sending the reader to the end of the
    // page. It stays absolutely positioned in page coordinates: neither the
    // block nor its parent establishes a containing block, so moving it does
    // not change where it lands.
    if (this.bar.previousElementSibling !== block) {
      block.after(this.bar);
    }

    // Wrap the bar in a holder so `data-reaction-anchor` drives paint().
    this.bar.dataset.reactionAnchor = this.barAnchor;
    this.paint();

    var rect = range.getBoundingClientRect();
    this.bar.hidden = false;
    var width = this.bar.offsetWidth;
    var left = rect.left + rect.width / 2 - width / 2 + window.scrollX;
    left = Math.max(8, Math.min(left, window.innerWidth - width - 8));
    this.bar.style.left = left + "px";
    this.bar.style.top =
      rect.top + window.scrollY - this.bar.offsetHeight - 8 + "px";
  };

  // ------------------------------------------------------------------ init

  Reactions.prototype.start = function () {
    var self = this;

    this.root.querySelectorAll(".reaction[data-kind]").forEach(function (button) {
      button.disabled = false;
      button.addEventListener("click", function () {
        self.toggle("", button.dataset.kind, button);
      });
    });

    if (this.perParagraph) {
      var update = function (event) {
        if (event && event.target && event.target.closest &&
            event.target.closest(".reaction-bar")) {
          return; // a press on the bar itself, not a new selection
        }
        self.showBarForSelection();
      };
      document.addEventListener("mouseup", update);
      document.addEventListener("keyup", function (event) {
        var key = event.key || "";
        if (key === "Shift" || key.indexOf("Arrow") === 0) update();
      });
      document.addEventListener("selectionchange", function () {
        var selection = window.getSelection();
        if (!selection || selection.isCollapsed) self.hideBar();
      });
      // Escape dismisses it; scrolling does not need to, since the bar is
      // positioned in page coordinates and travels with the passage.
      document.addEventListener("keydown", function (event) {
        if (event.key === "Escape") self.hideBar();
      });
    }

    this.api
      .read()
      .then(function (state) {
        self.absorb(state);
      })
      .catch(function () {
        // Counts are a nicety. If the service is down the buttons still work
        // and the page is otherwise unaffected.
      });
  };

  function init() {
    document
      .querySelectorAll(".reactions[data-reactions-endpoint]")
      .forEach(function (root) {
        // Each anchored block names itself for paint().
        document
          .querySelectorAll("article main [data-anchor]")
          .forEach(function (block) {
            block.dataset.reactionAnchor = block.dataset.anchor;
          });
        new Reactions(root).start();
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
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