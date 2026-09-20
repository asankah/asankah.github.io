// The bar that a text selection raises inside an article.
//
// Two features want to hang something off a selected passage -- reacting to it
// and discussing it -- and only one bar should ever appear. This owns the bar:
// when it is created, when it moves, when it goes away, and which block the
// selection belongs to. Features contribute buttons and are told the anchor.
//
// Selection is the trigger rather than a permanent control on every paragraph,
// because a control per paragraph would put several tab stops between a
// keyboard reader and the next sentence, and a hover-only affordance would not
// exist at all on a phone. Selecting text works with a mouse, a long-press,
// and Shift+Arrow alike.
(function () {
  "use strict";

  var SELECTION_MIN = 2;

  var bar = null;
  var contributors = [];
  var current = null; // { anchor, text, block }

  function ensureBar() {
    if (bar) return bar;
    bar = document.createElement("div");
    bar.className = "reaction-bar";
    bar.setAttribute("role", "group");
    bar.setAttribute("aria-label", "For the selected passage");
    bar.hidden = true;
    // Parked at the end of the document until a selection moves it next to
    // the passage it belongs to; see show().
    document.body.appendChild(bar);
    contributors.forEach(function (contributor) {
      contributor.mounted = true;
      bar.appendChild(contributor.button);
    });
    return bar;
  }

  function hide() {
    if (bar) bar.hidden = true;
    current = null;
  }

  function show() {
    var selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.rangeCount) return hide();

    var text = selection.toString().trim();
    if (text.length < SELECTION_MIN) return hide();

    var range = selection.getRangeAt(0);
    var node = range.commonAncestorContainer;
    if (node.nodeType === Node.TEXT_NODE) node = node.parentNode;
    var block = node && node.closest ? node.closest("[data-anchor]") : null;
    if (!block || !block.closest("article main")) return hide();

    ensureBar();
    current = { anchor: block.dataset.anchor, text: text, block: block };
    bar.dataset.reactionAnchor = current.anchor;
    contributors.forEach(function (contributor) {
      if (contributor.onShow) contributor.onShow(current);
    });

    // Sit the bar immediately after the passage in the document, so Tab from
    // the passage reaches it rather than sending the reader to the end of the
    // page. It stays absolutely positioned in page coordinates: neither the
    // block nor its parent establishes a containing block, so moving it does
    // not change where it lands.
    if (bar.previousElementSibling !== block) block.after(bar);

    var rect = range.getBoundingClientRect();
    bar.hidden = false;
    var width = bar.offsetWidth;
    var left = rect.left + rect.width / 2 - width / 2 + window.scrollX;
    left = Math.max(8, Math.min(left, window.innerWidth - width - 8));
    bar.style.left = left + "px";
    bar.style.top = rect.top + window.scrollY - bar.offsetHeight - 8 + "px";
  }

  /**
   * Adds a button to the bar. `onActivate` is called with the current
   * selection, `onShow` before the bar appears so the button can update
   * itself. Buttons appear in registration order.
   */
  function register(options) {
    var button = options.button;
    button.addEventListener("mousedown", function (event) {
      // Keep the selection alive through the click.
      event.preventDefault();
    });
    button.addEventListener("click", function () {
      if (current && options.onActivate) options.onActivate(current, button);
    });
    var contributor = { button: button, onShow: options.onShow, mounted: false };
    contributors.push(contributor);
    if (bar) {
      contributor.mounted = true;
      bar.appendChild(button);
    }
  }

  function start() {
    var update = function (event) {
      if (event && event.target && event.target.closest &&
          event.target.closest(".reaction-bar")) {
        return; // a press on the bar itself, not a new selection
      }
      show();
    };
    document.addEventListener("mouseup", update);
    document.addEventListener("keyup", function (event) {
      var key = event.key || "";
      if (key === "Shift" || key.indexOf("Arrow") === 0) update();
    });
    document.addEventListener("selectionchange", function () {
      var selection = window.getSelection();
      if (!selection || selection.isCollapsed) hide();
    });
    // Escape dismisses it; scrolling does not need to, since the bar is
    // positioned in page coordinates and travels with the passage.
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") hide();
    });
  }

  window.BlogSelectionBar = {
    register: register,
    hide: hide,
    current: function () {
      return current;
    },
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
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

  // Don't re-read for a reader who merely alt-tabbed and came straight back.
  var REFRESH_AFTER_MS = 20000;

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

  // The bar itself belongs to content/scripts/selection-bar.js, which both
  // this and the comment script hang buttons off so a selection only ever
  // raises one. Here we contribute the three marks.
  Reactions.prototype.registerMarks = function () {
    var self = this;
    if (!window.BlogSelectionBar) return;

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

      window.BlogSelectionBar.register({
        button: button,
        onShow: function () {
          // The bar carries the anchor, so paint() can fill these in.
          self.paint();
        },
        onActivate: function (selection) {
          self.toggle(selection.anchor, entry.kind, button);
        },
      });
    });
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

    if (this.perParagraph) this.registerMarks();

    var refresh = function () {
      self.api
        .read()
        .then(function (state) {
          self.absorb(state);
        })
        .catch(function () {
          // Counts are a nicety. If the service is down the buttons still work
          // and the page is otherwise unaffected; a failed refresh leaves the
          // counts already on screen alone.
        });
    };

    // Counts other people have left arrive when the reader comes back to the
    // tab, rather than on a timer: an idle tab should not keep talking to the
    // service all day. Their own presses already update from the POST
    // response, so this is only about everyone else's.
    var hiddenSince = 0;
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) {
        hiddenSince = Date.now();
        return;
      }
      if (Date.now() - hiddenSince < REFRESH_AFTER_MS) return;
      refresh();
    });

    refresh();
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

  // ------------------------------------------------------ anchored comments

  // A comment on a passage is a quote post of the announcement thread whose
  // text carries a deep link back to the block it is about:
  //
  //   https://xn--izc.com/posts/foo/#p-1a2b3c:~:text=the%20selected%20words
  //
  // The fragment does double duty. `#p-1a2b3c` is the block id that
  // lib/anchors.ts derives from the block's own text, and it is what the
  // renderer matches on -- exact, and not defeated by the passage being
  // quoted loosely. The `:~:text=` directive after it is for the browser,
  // which scrolls to and highlights the words themselves.
  //
  // Quote posts rather than replies because Bluesky's compose intent takes
  // only `text`: there is no reply-to parameter, but a bsky.app post URL in
  // the text becomes a quote embed, and app.bsky.feed.getQuotes finds them
  // afterwards. It also means "detach quote" is a moderation lever here.
  var COMPOSE_INTENT = "https://bsky.app/intent/compose?text=";

  // Bluesky's limit, in grapheme clusters. The deep link and the quoted
  // post's URL both count against it, so the passage gets whatever is left.
  var POST_LIMIT = 300;
  var SNIPPET_MIN = 12;

  function graphemes(text) {
    if (typeof Intl !== "undefined" && Intl.Segmenter) {
      var segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
      var n = 0;
      // eslint-disable-next-line no-unused-vars
      for (var _ of segmenter.segment(text)) n++;
      return n;
    }
    return Array.from(text).length;
  }

  function deepLink(anchor, snippet) {
    return (
      location.origin +
      location.pathname +
      "#" +
      anchor +
      ":~:text=" +
      encodeURIComponent(snippet)
    );
  }

  /**
   * Builds the compose text, trimming the quoted passage until the whole post
   * fits. Returns null if even the shortest passage cannot fit, which would
   * mean the two URLs alone have used the budget.
   */
  function composeText(anchor, passage, threadUrl) {
    var snippet = passage.replace(/\s+/g, " ").trim();
    while (snippet.length >= SNIPPET_MIN) {
      var body = "“" + snippet + "”\n\n" + deepLink(anchor, snippet) + "\n\n" + threadUrl;
      if (graphemes(body) <= POST_LIMIT) return body;
      // Trim back to a word boundary so the quote does not end mid-word.
      var cut = snippet.slice(0, Math.floor(snippet.length * 0.8));
      var space = cut.lastIndexOf(" ");
      snippet = (space > SNIPPET_MIN ? cut.slice(0, space) : cut).trim();
      // Drop any trailing punctuation the cut landed on, so the quote reads
      // "…some great storytelling…" rather than "…storytelling.…".
      snippet = snippet.replace(/[\s\p{P}]+$/u, "") + "…";
      if (snippet.length <= SNIPPET_MIN + 1) break;
    }
    return null;
  }

  /**
   * Pulls the block id out of a link back to this page. Returns null for any
   * link that is not one of ours, so an unrelated URL in a quote post cannot
   * anchor a comment to a passage.
   */
  function anchorFromLink(uri) {
    var parsed;
    try {
      parsed = new URL(uri, location.href);
    } catch (error) {
      return null;
    }
    if (parsed.origin !== location.origin) return null;
    if (parsed.pathname !== location.pathname) return null;
    var hash = parsed.hash.replace(/^#/, "");
    if (!hash) return null;
    var id = hash.split(":~:")[0];
    return /^[A-Za-z0-9._~-]{1,64}$/.test(id) ? id : null;
  }

  /** Every link a post record carries, from its facets. */
  function linksIn(record) {
    var facets = Array.isArray(record && record.facets) ? record.facets : [];
    var uris = [];
    facets.forEach(function (facet) {
      (facet.features || []).forEach(function (feature) {
        if (typeof feature.uri === "string") uris.push(feature.uri);
      });
    });
    return uris;
  }

  // ------------------------------------------------------------- memory

  // Opening the comments on a post is a standing preference, not a one-off:
  // a reader who asked once gets them opened on the way back, with the last
  // thread they saw already on screen while a fresh copy is fetched.
  //
  // Only threads this reader has explicitly opened are here, one entry per
  // post, in this browser alone. "Hide comments" forgets the post again, so
  // the preference stays revocable rather than being a one-way door.
  var MEMORY_KEY = "blog.comments.opened";
  var MEMORY_MAX = 20; // posts remembered, newest first
  // Per thread. A real thread is a few KB; this is a ceiling for a pathological
  // one, kept low because localStorage is shared with everything else the
  // reader's browser keeps for this origin.
  var CACHE_MAX_BYTES = 64 * 1024;
  var CACHE_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

  function readMemory() {
    try {
      var raw = window.localStorage.getItem(MEMORY_KEY);
      var parsed = raw ? JSON.parse(raw) : null;
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (error) {
      return {};
    }
  }

  function writeMemory(memory) {
    // Newest first, capped, so one reader's history cannot grow without bound.
    var keys = Object.keys(memory).sort(function (a, b) {
      return (memory[b].at || 0) - (memory[a].at || 0);
    });
    var kept = {};
    keys.slice(0, MEMORY_MAX).forEach(function (key) {
      kept[key] = memory[key];
    });
    try {
      window.localStorage.setItem(MEMORY_KEY, JSON.stringify(kept));
    } catch (error) {
      // Quota, a private window, blocked site data: the feature is a
      // convenience, so losing it changes nothing else about the page.
    }
  }

  /** Records that this reader opened the thread, and caches it if it is small. */
  function remember(atUri, payload, quotes) {
    if (!atUri) return;
    var memory = readMemory();
    var entry = { at: Date.now() };
    try {
      var serialized = JSON.stringify({ payload: payload, quotes: quotes });
      // A very long thread is remembered as a preference but not cached; the
      // next visit opens it and fetches, rather than filling up storage.
      if (serialized.length <= CACHE_MAX_BYTES) {
        entry.payload = payload;
        if (quotes) entry.quotes = quotes;
      }
    } catch (error) {
      /* unserializable: keep the preference, drop the cache */
    }
    memory[atUri] = entry;
    writeMemory(memory);
  }

  function forget(atUri) {
    var memory = readMemory();
    if (!(atUri in memory)) return;
    delete memory[atUri];
    writeMemory(memory);
  }

  /** The remembered entry for a post, or null if it is absent or too old. */
  function recall(atUri) {
    if (!atUri) return null;
    var entry = readMemory()[atUri];
    if (!entry) return null;
    if (Date.now() - (entry.at || 0) > CACHE_MAX_AGE_MS) return null;
    return entry;
  }

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

  /** The passage a block holds, trimmed to something quotable. */
  function passageText(anchor) {
    var block = document.getElementById(anchor);
    if (!block) return "";
    var text = (block.textContent || "").replace(/\s+/g, " ").trim();
    return text.length > 140 ? text.slice(0, 139).trimEnd() + "…" : text;
  }

  /** A group of comments about one passage, headed by the passage itself. */
  function renderPassage(anchor, posts) {
    var group = element("section", "comment-passage");
    group.dataset.anchor = anchor;

    var header = element("p", "comment-passage-quote");
    var quoted = passageText(anchor);
    if (quoted) {
      var link = element("a");
      link.href = "#" + anchor;
      link.textContent = "“" + quoted + "”";
      header.appendChild(link);
    } else {
      // The passage has been edited away since the comment was written. Say
      // so rather than silently dropping a real comment on the floor.
      header.className += " comment-passage-gone";
      header.textContent = "On a passage that has since been revised";
    }
    group.appendChild(header);

    posts.forEach(function (post) {
      group.appendChild(renderComment({ post: post, depth: 0 }));
    });
    return group;
  }

  /**
   * Marks the blocks that have passage comments, so a reader meets them while
   * reading rather than only at the bottom. A readout, not a control: no tab
   * stop, and it is a link to the comment rather than anything that toggles.
   */
  function markAnchoredBlocks(anchored) {
    document.querySelectorAll("article main .passage-comment-mark").forEach(
      function (mark) {
        mark.remove();
      }
    );
    Object.keys(anchored).forEach(function (anchor) {
      var block = document.getElementById(anchor);
      if (!block) return;
      var tag = block.tagName;
      // A <span> is only legal inside a block that takes flow content.
      if (tag !== "P" && tag !== "BLOCKQUOTE") return;
      var mark = element("a", "passage-comment-mark");
      mark.href = "#comments";
      var n = anchored[anchor].length;
      mark.textContent = "💬 " + n;
      mark.setAttribute(
        "aria-label",
        n + (n === 1 ? " comment" : " comments") + " on this passage"
      );
      block.appendChild(mark);
    });
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

  /**
   * Turns a getPostThread payload into the rendered thread. Every moderation
   * gate is re-applied here rather than at fetch time, so a payload replayed
   * from cache is filtered by the denylist and label list built into *this*
   * page load, not the one it was saved under.
   */
  /**
   * Quote posts of the announcement thread that carry a deep link back to a
   * block on this page, keyed by that block's id. Same moderation gates as a
   * reply -- a quote post is a post, and a blocked author is blocked here too.
   */
  function anchoredFrom(quotes, context) {
    var byAnchor = {};
    var posts = (quotes && Array.isArray(quotes.posts)) ? quotes.posts : [];
    posts.forEach(function (post) {
      if (!isVisible(post, context)) return;
      var uris = linksIn(post.record);
      for (var i = 0; i < uris.length; i++) {
        var anchor = anchorFromLink(uris[i]);
        if (!anchor) continue;
        (byAnchor[anchor] = byAnchor[anchor] || []).push(post);
        return; // one anchor per post: the first link back to this page wins
      }
    });
    Object.keys(byAnchor).forEach(function (anchor) {
      byAnchor[anchor].sort(function (a, b) {
        return (Date.parse(a.indexedAt) || 0) - (Date.parse(b.indexedAt) || 0);
      });
    });
    return byAnchor;
  }

  function render(section, payload, options) {
    var thread = section.querySelector(".comments-thread");
    var context = readConfig(section);
    var reloading = !!(options && options.reloading);
    var fail = (options && options.fail) || function () {};
    var quotes = options && options.quotes;

    var root = payload && payload.thread;
    if (!root || !root.post) {
      fail("That Bluesky thread is no longer available.");
      return false;
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

    var anchored = anchoredFrom(quotes, context);
    var anchoredCount = Object.keys(anchored).reduce(function (n, key) {
      return n + anchored[key].length;
    }, 0);

    thread.replaceChildren();
    var total = entries.length + anchoredCount;
    if (!total) {
      renderMessage(thread, "No comments yet.");
    } else {
      var count = element("p", "comments-count");
      count.textContent = total + (total === 1 ? " comment" : " comments");
      thread.appendChild(count);

      // Passage comments first, each under the words it is about.
      Object.keys(anchored).forEach(function (anchor) {
        thread.appendChild(renderPassage(anchor, anchored[anchor]));
      });

      entries.forEach(function (entry) {
        thread.appendChild(renderComment(entry));
      });
    }
    markAnchoredBlocks(anchored);

    // The explanation has served its purpose once the thread is on screen, but
    // the button has not: it is the only way to pick up replies posted since.
    var blurb = section.querySelectorAll(".comments-intro > p");
    for (var i = 0; i < blurb.length; i++) blurb[i].hidden = true;
    thread.setAttribute("tabindex", "-1");
    if (!reloading) thread.focus({ preventScroll: true });
    section.dataset.bskyLoaded = "1";
    return true;
  }

  async function load(section) {
    var thread = section.querySelector(".comments-thread");
    var context = readConfig(section);
    var atUri = toAtUri(section.dataset.bskyThread);

    // A re-check keeps the comments already on screen: replacing them with a
    // placeholder would flash, and replacing them with an error would lose
    // readable content because a later request failed. Replaying from cache
    // counts as already on screen for the same reason.
    var reloading = section.dataset.bskyLoaded === "1";

    thread.hidden = false;
    if (!reloading) renderMessage(thread, "Loading comments…");

    function fail(message) {
      if (!reloading) renderMessage(thread, message);
    }

    if (!atUri) {
      fail("This post’s discussion link is malformed.");
      return;
    }

    var endpoint =
      context.service +
      "/xrpc/app.bsky.feed.getPostThread?uri=" +
      encodeURIComponent(atUri) +
      "&depth=" +
      context.maxDepth +
      "&parentHeight=0";

    // Started before the thread is awaited so the two are in flight together.
    var quotePromise = fetch(
      context.service +
        "/xrpc/app.bsky.feed.getQuotes?uri=" +
        encodeURIComponent(atUri) +
        "&limit=100",
      { headers: { Accept: "*/*" } }
    ).then(function (response) {
      return response.ok ? response.json() : null;
    });
    // Nothing awaits this until the thread has rendered; claim it now so a
    // rejection cannot surface as an unhandled rejection in the meantime.
    quotePromise.catch(function () {});

    var payload;
    try {
      var response = await fetch(endpoint, { headers: { Accept: "*/*" } });
      if (!response.ok) throw new Error("HTTP " + response.status);
      payload = await response.json();
    } catch (error) {
      fail("Couldn’t reach Bluesky just now. The thread is still readable there.");
      return;
    }

    // The thread renders as soon as it arrives. Quote posts -- the passage
    // comments -- are a second request, and the replies must not wait on it:
    // a slow or failing getQuotes would otherwise hold up the whole thread.
    var cached = recall(atUri);
    if (!render(section, payload, {
      reloading: reloading,
      fail: fail,
      quotes: cached && cached.quotes,
    })) {
      return;
    }
    remember(atUri, payload, cached && cached.quotes);

    quotePromise
      .then(function (quotes) {
        if (!quotes) return;
        // Re-render with the passage comments folded in. `reloading` so the
        // thread already on screen is replaced without a placeholder.
        if (render(section, payload, { reloading: true, quotes: quotes })) {
          remember(atUri, payload, quotes);
        }
      })
      .catch(function () {
        // Passage comments are an enhancement; the thread stands without them.
      });
  }

  /**
   * Hangs a Discuss button off the shared selection bar. Pressing it opens
   * Bluesky's composer with the passage quoted, a deep link back to it, and
   * the announcement post's URL -- which the composer turns into a quote
   * embed, and which is how the reply is found again.
   *
   * This opens a compose window and nothing else: no post is made on the
   * reader's behalf, and they can edit or abandon it.
   */
  function registerDiscuss(section) {
    if (!window.BlogSelectionBar) return;
    var threadUrl = section.dataset.bskyThread;
    if (!threadUrl) return;

    var button = document.createElement("button");
    button.type = "button";
    button.className = "reaction reaction-small discuss-passage";
    button.title = "Discuss this passage on Bluesky";

    var mark = document.createElement("span");
    mark.className = "reaction-mark";
    mark.setAttribute("aria-hidden", "true");
    mark.textContent = "💬";
    button.appendChild(mark);

    var label = document.createElement("span");
    label.className = "reaction-label sr-only";
    label.textContent = "Discuss this passage on Bluesky";
    button.appendChild(label);

    window.BlogSelectionBar.register({
      button: button,
      onActivate: function (selection) {
        var text = composeText(selection.anchor, selection.text, threadUrl);
        if (!text) return; // nothing would fit; leave the selection alone
        window.open(COMPOSE_INTENT + encodeURIComponent(text), "_blank", "noopener");
        window.BlogSelectionBar.hide();
      },
    });
  }

  var LOAD_LABEL = "Load comments from Bluesky";
  var REFRESH_LABEL = "Check for new replies";

  // Don't re-fetch for a reader who merely alt-tabbed and came straight back.
  var REFRESH_AFTER_MS = 20000;

  function init() {
    document.querySelectorAll(".comments[data-bsky-thread]").forEach(
      function (section) {
        var button = section.querySelector(".comments-load");
        if (!button) return;
        var atUri = toAtUri(section.dataset.bskyThread);
        var thread = section.querySelector(".comments-thread");
        var hide = section.querySelector(".comments-hide");

        button.hidden = false; // only now is it something that works

        function relabel() {
          var loaded = section.dataset.bskyLoaded === "1";
          button.textContent = loaded ? REFRESH_LABEL : LOAD_LABEL;
          if (hide) hide.hidden = !loaded;
        }

        function fetchThread() {
          var loaded = section.dataset.bskyLoaded === "1";
          button.disabled = true;
          button.textContent = loaded ? "Checking…" : "Loading…";
          return load(section).finally(function () {
            button.disabled = false;
            relabel();
          });
        }

        button.addEventListener("click", fetchThread);

        // Collapsing is also how a reader takes the standing preference back:
        // the post is forgotten, so the next visit is quiet again.
        if (hide) {
          hide.addEventListener("click", function () {
            forget(atUri);
            section.dataset.bskyLoaded = "";
            thread.replaceChildren();
            thread.hidden = true;
            var blurb = section.querySelectorAll(".comments-intro > p");
            for (var i = 0; i < blurb.length; i++) blurb[i].hidden = false;
            relabel();
            button.focus();
          });
        }

        registerDiscuss(section);

        // A reader who opened this thread before gets it opened again, with
        // the copy they last saw on screen immediately and a fresh one on the
        // way. Nothing here runs for a post they have not opened.
        var seen = recall(atUri);
        if (seen) {
          if (seen.payload) {
            render(section, seen.payload, { reloading: false, quotes: seen.quotes });
          }
          relabel();
          fetchThread();
        }

        // The path worth catching: a reader follows "Reply on Bluesky",
        // replies, and comes back to this tab expecting to see it. Only ever
        // after they have asked for the thread once -- before that, this page
        // still makes no request to Bluesky at all.
        var hiddenSince = 0;
        document.addEventListener("visibilitychange", function () {
          if (document.hidden) {
            hiddenSince = Date.now();
            return;
          }
          if (section.dataset.bskyLoaded !== "1" || button.disabled) return;
          if (Date.now() - hiddenSince < REFRESH_AFTER_MS) return;
          fetchThread();
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