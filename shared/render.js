"use strict";

/* ---------------------------------------------------------------------------
 * Minimal markdown rendering, shared by the popup and the in-page modal.
 *
 * The model returns simple markdown. Rather than pull in a parser dependency,
 * this handles the handful of constructs we actually ask for, and builds real
 * DOM nodes (never innerHTML) so model output can't inject markup.
 * ------------------------------------------------------------------------ */

function inlineInto(parent, text) {
  // Split on **bold** and `code`, keeping delimiters.
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);

  for (const part of parts) {
    if (!part) continue;

    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      const strong = document.createElement("strong");
      strong.textContent = part.slice(2, -2);
      parent.append(strong);
    } else if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      const code = document.createElement("code");
      code.textContent = part.slice(1, -1);
      parent.append(code);
    } else {
      parent.append(document.createTextNode(part));
    }
  }
}

function toBlocks(text) {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const blocks = [];
  let list = null;
  let para = [];

  const flushPara = () => {
    if (para.length) {
      blocks.push({ type: "p", text: para.join(" ").trim() });
      para = [];
    }
  };
  const flushList = () => {
    if (list) {
      blocks.push(list);
      list = null;
    }
  };

  for (const raw of lines) {
    const line = raw.trim();

    if (!line) {
      flushPara();
      flushList();
      continue;
    }

    const bullet = line.match(/^(?:[-*•]|\d+[.)])\s+(.*)$/);
    if (bullet) {
      flushPara();
      if (!list) list = { type: "ul", items: [] };
      list.items.push(bullet[1]);
      continue;
    }

    const heading = line.match(/^#{1,6}\s+(.*)$/);
    if (heading) {
      flushPara();
      flushList();
      blocks.push({ type: "h", text: heading[1] });
      continue;
    }

    // A short line that is entirely bold reads as a section heading.
    const boldOnly = line.match(/^\*\*(.+)\*\*:?$/);
    if (boldOnly && boldOnly[1].length < 60) {
      flushPara();
      flushList();
      blocks.push({ type: "h", text: boldOnly[1].replace(/:$/, "") });
      continue;
    }

    flushList();
    para.push(line);
  }

  flushPara();
  flushList();
  return blocks;
}

const TLDR_RE = /^\*{0,2}TL;?DR\*{0,2}\s*:?\s*/i;

// `target` is emptied and refilled. It can live in a document or in a shadow
// root — the popup passes its <article>, the content script passes a node
// inside the modal's shadow DOM.
function renderSummaryInto(target, text) {
  target.replaceChildren();
  const blocks = toBlocks(text);

  blocks.forEach((block, i) => {
    if (block.type === "p") {
      // The first paragraph is the TL;DR — give it the callout treatment.
      if (i === 0 || TLDR_RE.test(block.text)) {
        const box = document.createElement("div");
        box.className = "tldr";

        const label = document.createElement("span");
        label.className = "tldr-label";
        label.textContent = "TL;DR";
        box.append(label);

        const p = document.createElement("p");
        p.style.margin = "0";
        inlineInto(p, block.text.replace(TLDR_RE, ""));
        box.append(p);

        target.append(box);
        return;
      }

      const p = document.createElement("p");
      inlineInto(p, block.text);
      target.append(p);
      return;
    }

    if (block.type === "h") {
      const h = document.createElement("h3");
      h.textContent = block.text;
      target.append(h);
      return;
    }

    const ul = document.createElement("ul");
    for (const item of block.items) {
      const li = document.createElement("li");
      inlineInto(li, item);
      ul.append(li);
    }
    target.append(ul);
  });
}

function relativeTime(ts) {
  const secs = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (secs < 60) return "just now";
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(ts).toLocaleDateString();
}
