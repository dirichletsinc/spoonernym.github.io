"use strict";

// ---- Setup ----

// Written by build.py: date, clue, fn (function words around the two boxes),
// salt, answer/mid (per-box lists of word hashes), root (path to site root),
// dev (show the reset button), tutorialSteps, and on tutorial pages, tutorial
// (plain words for the coach in tutorial.js).
const puzzle = JSON.parse(document.getElementById("puzzle").textContent);
const tutorial = puzzle.tutorial;

// Tutorial steps save like games but never count towards results.
const TUTORIAL_PREFIX = "spoonernym:tutorial:";
const TUTORIAL_DONE_KEY = `${TUTORIAL_PREFIX}done`;  // steps solved, counting in order from 1
const tutorialKey = step => `${TUTORIAL_PREFIX}${step}`;
const GAME_KEY = tutorial ? tutorialKey(tutorial.step) : `spoonernym:game:${puzzle.date}`;
const RESULTS_KEY = "spoonernym:results";
const THEME_KEY = "spoonernym:theme";
const COLOUR_BLIND_KEY = "spoonernym:cb";

const COLORS = {
  green:  { icon: "✓", label: "right word, right spot", emoji: "🟩" },
  lime:   { icon: "⇄", label: "right word, wrong spot", emoji: "🟢" },
  yellow: { icon: "~", label: "on the right track",     emoji: "🟨" },
  grey:   { icon: "·", label: "not it",                 emoji: "⬜" },
};

// ---- Hashing ----

// SHA-256 over UTF-8, matching hashlib.sha256 in build.py.
const K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];
const rotr = (x, n) => (x >>> n) | (x << (32 - n));

function sha256(text) {
  const bytes = new TextEncoder().encode(text);

  // Big-endian 32-bit words, padded to 64-byte blocks: 0x80, zeros, bit length.
  const words = new Uint32Array(((bytes.length + 72) >> 6) * 16);
  bytes.forEach((byte, i) => { words[i >> 2] |= byte << (24 - 8 * (i % 4)); });
  words[bytes.length >> 2] |= 0x80 << (24 - 8 * (bytes.length % 4));
  words[words.length - 1] = bytes.length * 8;

  const hash = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  const w = new Uint32Array(64);  // Uint32Array wraps additions mod 2^32
  for (let block = 0; block < words.length; block += 16) {
    for (let t = 0; t < 64; t++) {
      if (t < 16) {
        w[t] = words[block + t];
      } else {
        const s0 = rotr(w[t - 15], 7) ^ rotr(w[t - 15], 18) ^ (w[t - 15] >>> 3);
        const s1 = rotr(w[t - 2], 17) ^ rotr(w[t - 2], 19) ^ (w[t - 2] >>> 10);
        w[t] = w[t - 16] + s0 + w[t - 7] + s1;
      }
    }

    let [a, b, c, d, e, f, g, h] = hash;
    for (let t = 0; t < 64; t++) {
      const sum1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const choose = (e & f) ^ (~e & g);
      const temp1 = (h + sum1 + choose + K[t] + w[t]) | 0;
      const sum0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (sum0 + majority) | 0;
      [h, g, f, e, d, c, b, a] = [g, f, e, (d + temp1) | 0, c, b, a, (temp1 + temp2) | 0];
    }
    [a, b, c, d, e, f, g, h].forEach((v, i) => { hash[i] = (hash[i] + v) | 0; });
  }
  return hash.map(v => (v >>> 0).toString(16).padStart(8, "0")).join("");
}

// ---- Words and scoring ----

// Must match norm_word() in build.py.
function normWord(text) {
  const parts = text.normalize("NFKC").toLowerCase().replace(/['’]/g, "").match(/[\p{L}\p{N}]+/gu);
  return parts ? parts.join("") : "";
}

function splitWords(text) {
  return text.replace(/[-–—]/g, " ").split(/\s+/).map(normWord).filter(Boolean);
}

const wordHash = (box, word) => sha256(`${puzzle.salt}:${box}:${word}`);

// Answer word in its own box: green; in the other box: lime. Intermediate word in either box: yellow.
function scoreGuess(words) {
  return words.map((word, box) => {
    const other = 1 - box;
    const hashes = [wordHash(0, word), wordHash(1, word)];
    if (puzzle.answer[box].includes(hashes[box])) return "green";
    if (puzzle.answer[other].includes(hashes[other])) return "lime";
    if (puzzle.mid.some((boxHashes, i) => boxHashes.includes(hashes[i]))) return "yellow";
    return "grey";
  });
}

// ---- Storage ----

// localStorage can throw (private mode, blocked storage); the game still works without it.
function load(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
function save(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}
// Settings are plain strings so the <head> script can read them without JSON.
function loadSetting(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function saveSetting(key, value) {
  try { localStorage.setItem(key, value); } catch {}
}

// ---- Game state ----

// Guesses are unlimited; the game ends when one is all green. Score is the guess count.
const guesses = load(GAME_KEY, []).filter(g => Array.isArray(g) && g.length === 2);
const scores = guesses.map(scoreGuess);

const isSolved = () => scores.some(colors => colors.every(c => c === "green"));

function resultText() {
  return ["Hole in one!", "Nicely done!", "Got it!"][guesses.length - 1] ?? `Solved in ${guesses.length} guesses.`;
}

function describeGuess(words, colors) {
  return words.map((word, i) => `${word}, ${COLORS[colors[i]].label}`).join("; ");
}

function shareText() {
  const count = `${guesses.length} ${guesses.length === 1 ? "guess" : "guesses"}`;
  return [`Spoonernym ${puzzle.date} · ${count}`, ...shareRows(scores)].join("\n");
}

// ---- Share rows ----

const SHOWN_MISSES = 3;

// One emoji row per guess. Misses after the first SHOWN_MISSES collapse into "⬜⬜ ×n".
function shareRows(scores) {
  const rows = scores.map(colors => colors.map(c => COLORS[c].emoji).join(""));
  const hidden = rows.length - 1 - SHOWN_MISSES;
  if (hidden < 2) return rows;
  const grey = COLORS.grey.emoji.repeat(2);
  return [...rows.slice(0, SHOWN_MISSES), `${grey} ×${hidden}`, rows[rows.length - 1]];
}

// ---- Stats ----

// results: { "YYYY-MM-DD": guesses used }. Drops 0s, which were losses under the old
// 3-try rules; those days are in progress again.
function solvedResults(results) {
  return Object.fromEntries(Object.entries(results).filter(([, n]) => Number.isInteger(n) && n > 0));
}

// Recorded once per puzzle, when it's solved.
function recordResult() {
  const results = solvedResults(load(RESULTS_KEY, {}));
  if (!(puzzle.date in results)) results[puzzle.date] = guesses.length;
  save(RESULTS_KEY, results);
  return results;
}

function dayAfter(date) {
  const next = new Date(`${date}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 10);
}

// A streak is puzzles solved on consecutive dates, ending at the latest result.
function computeStats(results) {
  const dates = Object.keys(results).sort();
  let streak = 0, best = 0;
  dates.forEach((date, i) => {
    streak = i && dayAfter(dates[i - 1]) === date ? streak + 1 : 1;
    best = Math.max(best, streak);
  });
  const total = dates.reduce((sum, date) => sum + results[date], 0);
  return {
    played: dates.length,
    average: dates.length ? (total / dates.length).toFixed(1) : "–",
    streak,
    best,
  };
}

// ---- Rendering ----

const $ = id => document.getElementById(id);

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

// Fills a row in phrase order: fn[0] box0 fn[1] box1 fn[2].
function fillPhraseRow(row, boxes) {
  puzzle.fn.forEach((fnWords, i) => {
    if (fnWords.length) row.append(el("span", "fn", fnWords.join(" ")));
    if (i < boxes.length) row.append(boxes[i]);
  });
  return row;
}

function makeTile(word, color, isNew) {
  const tile = el("span", `tile ${color}${isNew ? " new" : ""}`);
  const icon = el("span", "tile-icon", COLORS[color].icon);
  icon.setAttribute("aria-hidden", "true");
  tile.append(el("span", "tile-word", word), icon, el("span", "sr-only", ` (${COLORS[color].label})`));
  return tile;
}

function makeInputs() {
  return ["First word", "Second word"].map((label, i) => {
    const input = el("input", "word-input");
    Object.assign(input, { id: `word-${i}`, type: "text", placeholder: `word ${i + 1}`, spellcheck: false });
    input.setAttribute("aria-label", label);
    input.setAttribute("autocapitalize", "none");
    input.setAttribute("autocorrect", "off");
    input.setAttribute("enterkeyhint", i === 0 ? "next" : "go");
    return input;
  });
}

const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");

// The board scrolls once it outgrows its max-height; keep the newest guess in view.
function renderBoard(newRowIndex) {
  const board = $("board");
  board.replaceChildren(...guesses.map((words, i) => {
    const li = el("li", "row");
    li.append(el("span", "sr-only", `Guess ${i + 1}: `));
    return fillPhraseRow(li, words.map((word, box) => makeTile(word, scores[i][box], i === newRowIndex)));
  }));
  const scrolls = board.scrollHeight > board.clientHeight;
  if (scrolls) board.tabIndex = 0;  // scrollable regions need to be reachable by keyboard
  else board.removeAttribute("tabindex");
  const smooth = newRowIndex >= 0 && !reducedMotion.matches;
  board.scrollTo({ top: board.scrollHeight, behavior: smooth ? "smooth" : "instant" });
}

// Fade the top edge only when guesses are hidden above it.
function updateBoardFade() {
  $("board").classList.toggle("scrolled", $("board").scrollTop > 0);
}

function renderTutorialResult() {
  if (tutorial.step === load(TUTORIAL_DONE_KEY, 0) + 1) save(TUTORIAL_DONE_KEY, tutorial.step);
  $("result-title").textContent = resultText();
  $("stats").hidden = true;
  $("share").hidden = true;
  const next = $("next");
  next.href = tutorial.next;
  next.textContent = tutorial.step < tutorial.steps ? "Next puzzle" : "Play today's puzzle";
  next.hidden = false;
  $("result").hidden = false;
}

// Back-seat driving: a message after every guess, and a free word in its empty box if it's time.
function renderCoach() {
  const advice = coach(tutorial, guesses.map((words, i) => ({ words, colors: scores[i] })));
  $("coach").textContent = advice.message;
  $("coach").hidden = false;
  const free = advice.fill;
  if (free && !isSolved() && !inputs[free.box].value) inputs[free.box].value = free.word;
}

function renderResult() {
  if (tutorial) return renderTutorialResult();
  const stats = computeStats(recordResult());
  const items = [["Played", stats.played], ["Average", stats.average], ["Streak", stats.streak], ["Best", stats.best]];
  $("result-title").textContent = resultText();
  $("stats").replaceChildren(...items.map(([name, value]) => {
    const item = el("div");
    item.append(el("dt", null, name), el("dd", null, value));
    return item;
  }));
  $("result").hidden = false;
}

function render(newRowIndex = -1) {
  renderBoard(newRowIndex);
  if (tutorial) renderCoach();
  $("turn").textContent = isSolved() ? "" : `Guess ${guesses.length + 1}`;
  $("form").hidden = isSolved();
  if (isSolved()) renderResult();
}

// Errors and confirmations are shown; guess results go to screen readers only,
// since the board already shows them.
function announce(message, { visible = true } = {}) {
  $("status").textContent = message;
  $("status").classList.toggle("sr-only", !visible);
}

// ---- Guessing ----

const inputs = makeInputs();

// Returns the two normalised words, or null after explaining what's wrong.
function readGuess() {
  const words = [];
  for (const input of inputs) {
    const parts = splitWords(input.value);
    if (parts.length !== 1) {
      announce(parts.length ? "One word per box." : "Enter a word in each box.");
      input.focus();
      return null;
    }
    words.push(parts[0]);
  }
  if (guesses.some(g => g[0] === words[0] && g[1] === words[1])) {
    announce("You already tried that.");
    return null;
  }
  return words;
}

function submitGuess(event) {
  event.preventDefault();
  if (isSolved()) return;
  const words = readGuess();
  if (!words) return;

  const colors = scoreGuess(words);
  guesses.push(words);
  scores.push(colors);
  save(GAME_KEY, guesses);
  // Keep green words in place; clear the rest (before render, which may add a free word).
  inputs.forEach((input, i) => { input.value = colors[i] === "green" ? words[i] : ""; });
  render(guesses.length - 1);

  const outcome = isSolved() ? ` ${resultText()}` : "";
  const coaching = tutorial ? ` ${$("coach").textContent}` : "";
  announce(`Guess ${guesses.length}: ${describeGuess(words, colors)}.${outcome}${coaching}`, { visible: false });
  if (isSolved()) $(tutorial ? "next" : "share").focus();
  else (inputs.find(input => !input.value) || inputs[0]).focus();
}

// ---- Sharing ----

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Clipboard API needs a secure context; fall back to a hidden textarea.
    const area = el("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.append(area);
    area.select();
    try { return document.execCommand("copy"); } catch { return false; } finally { area.remove(); }
  }
}

async function share() {
  const text = shareText();
  const copied = await copyText(text);
  announce(copied ? "Copied to clipboard." : `Couldn't copy. Here it is: ${text.replace(/\n/g, " ")}`);
}

function forget(test) {
  try {
    Object.keys(localStorage).filter(test).forEach(key => localStorage.removeItem(key));
  } catch {}
}

// Dev builds only: forget every puzzle's guesses, all stats and the tutorial. Settings stay.
function resetProgress() {
  forget(key => key.startsWith("spoonernym:game:") || key.startsWith(TUTORIAL_PREFIX) || key === RESULTS_KEY);
  location.reload();
}

// ---- Settings ----

const root = document.documentElement;
const systemDark = matchMedia("(prefers-color-scheme: dark)");

function syncToggles() {
  $("theme-toggle").checked = root.dataset.theme === "dark";
  $("cb-toggle").checked = root.dataset.cb === "1";
}

function toggleTheme() {
  root.dataset.theme = root.dataset.theme === "dark" ? "light" : "dark";
  saveSetting(THEME_KEY, root.dataset.theme);
  syncToggles();
}

function toggleColourBlind() {
  if (root.dataset.cb === "1") delete root.dataset.cb;
  else root.dataset.cb = "1";
  saveSetting(COLOUR_BLIND_KEY, root.dataset.cb ?? "0");
  syncToggles();
}

// Follow the system theme until the player picks one.
function followSystemTheme() {
  if (loadSetting(THEME_KEY)) return;
  root.dataset.theme = systemDark.matches ? "dark" : "light";
  syncToggles();
}

// ---- Start ----

function renderStaticContent() {
  $("clue").textContent = puzzle.clue;

  const date = $("date");
  if (tutorial) {
    date.textContent = `Tutorial · ${tutorial.step} of ${tutorial.steps}`;
  } else {
    date.dateTime = puzzle.date;
    date.textContent = new Date(`${puzzle.date}T00:00:00Z`).toLocaleDateString(undefined,
      { weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
  }

  const link = (text, href) => Object.assign(el("a", null, text), { href });
  const isArchivePage = puzzle.root !== "";
  if (isArchivePage) $("nav").append(link("Today's puzzle", `${puzzle.root}index.html`), " · ");
  $("nav").append(link("Past puzzles", `${puzzle.root}archive/index.html`));

  fillPhraseRow($("input-row"), inputs);
}

function setUpHelp() {
  const help = $("help");
  $("help-btn").addEventListener("click", () => help.showModal());
  $("help-close").addEventListener("click", () => help.close());
  help.addEventListener("click", event => { if (event.target === help) help.close(); });  // backdrop
  setUpTutorialLink();
}

// Try, continue or replay, depending on saved progress. Hidden on tutorial pages.
function setUpTutorialLink() {
  const link = $("tutorial-link");
  const steps = puzzle.tutorialSteps;
  if (tutorial || !steps) {
    link.parentElement.hidden = true;
    return;
  }
  const done = Math.min(load(TUTORIAL_DONE_KEY, 0), steps);
  const finished = done === steps;
  link.href = `${puzzle.root}tutorial/${finished ? 1 : done + 1}.html`;
  if (finished) {
    link.textContent = "Replay the tutorial";
    const clear = () => forget(key => key.startsWith(TUTORIAL_PREFIX));
    link.addEventListener("click", clear);
    link.addEventListener("auxclick", clear);  // middle-click opens a new tab
    return;
  }
  const started = done > 0 || load(tutorialKey(1), []).length > 0;
  link.textContent = started ? `Continue the tutorial (${done + 1} of ${steps})` : "Try the tutorial";
}

renderStaticContent();
setUpHelp();
syncToggles();
render();

$("form").addEventListener("submit", submitGuess);
$("share").addEventListener("click", share);
$("board").addEventListener("scroll", updateBoardFade, { passive: true });
$("theme-toggle").addEventListener("change", toggleTheme);
$("cb-toggle").addEventListener("change", toggleColourBlind);
systemDark.addEventListener("change", followSystemTheme);
if (puzzle.dev) {
  $("reset-btn").hidden = false;
  $("reset-btn").addEventListener("click", resetProgress);
}

// Enter in the first box moves on instead of submitting half a guess.
inputs[0].addEventListener("keydown", event => {
  if (event.key === "Enter" && !inputs[1].value.trim()) {
    event.preventDefault();
    inputs[1].focus();
  }
});

// Skip autofocus on touch screens so the keyboard doesn't pop up uninvited.
if (!isSolved() && matchMedia("(pointer: fine)").matches) inputs[0].focus({ preventScroll: true });
