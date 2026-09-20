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