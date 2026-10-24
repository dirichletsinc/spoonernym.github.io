"use strict";

// Tutorial coach, loaded before game.js on tutorial pages. coach() decides what to say
// after each guess; t is puzzle.tutorial from build.py, history is [{ words, colors }].

const FREE_AFTER = 2;  // guesses without any synonym before one is given (after the hint, if any)
const BOXES = ["first", "second"];

const upper = word => word.toUpperCase();
const quoted = word => `"${word}"`;
const looseHint = hint => `These might not be exact synonyms. Try a more general or more specific word. ${hint}`;

function coach(t, history) {
  if (!history.length) return { message: t.intro, fill: null };
  const last = history[history.length - 1];
  if (last.colors.every(c => c === "green")) {
    const clue = t.clue.join(" ");
    const chain = [clue[0].toUpperCase() + clue.slice(1), upper(t.mid.join(" ")), upper(t.answer.join(" "))];
    return { message: `${chain.join(" → ")}. ${t.lesson}`, fill: null };
  }
  if (last.colors.every(c => c === "lime")) return { message: "Right words, wrong order. Swap them!", fill: null };

  // Guess number (from 1) where each synonym first appeared in either box, or Infinity.
  const firstSeen = spellings => {
    const i = history.findIndex(h => h.words.some(word => spellings.includes(word)));
    return i < 0 ? Infinity : i + 1;
  };
  const foundAt = t.midSpellings.map(firstSeen);

  // One free first synonym, only if nothing at all was right in time; never a second.
  const freeAt = t.hints.some(Boolean) ? 2 * FREE_AFTER : FREE_AFTER;
  const anyRight = history.slice(0, freeAt).some(h => h.colors.some(c => c === "green" || c === "lime"));
  const free = history.length >= freeAt && Math.min(...foundAt) > freeAt && !anyRight;
  const found = [free || foundAt[0] <= history.length, foundAt[1] <= history.length];  // the free word counts
  const bothFound = found[0] && found[1];

  const said = last.words.map((word, box) => feedback(t, history, word, box, last.colors[box], bothFound));
  const green = last.words.find((word, box) => last.colors[box] === "green");
  let next;
  if (green) {
    next = `Keep ${upper(green)} and fix the other word.`;
  } else if (bothFound) {
    const swap = t.literal.join(" ") === t.answer.join(" ")
      ? `swap their first letters: ${upper(t.onsets[0])}↔${upper(t.onsets[1])}.`
      : "swap their first sounds and spell the new words the usual way.";
    next = `You've got both synonyms, ${upper(t.mid[0])} and ${upper(t.mid[1])}. Now ${swap}`;
  } else if (free && history.length === freeAt) {
    next = `Here's one for free: ${quoted(t.clue[0])} → ${upper(t.mid[0])}. `
      + `Now find a word for ${quoted(t.clue[1])}.`;
  } else if (found[0] || found[1]) {
    const have = found[0] ? 0 : 1;
    const missing = 1 - have;
    next = `You've got ${upper(t.mid[have])}. Now find a word for ${quoted(t.clue[missing])}.`;
    if (t.hints[missing] && history.length >= FREE_AFTER) next += ` ${looseHint(t.hints[missing])}`;
  } else if (t.hints.some(Boolean) && history.length >= FREE_AFTER) {
    next = looseHint(t.hints.find(Boolean));
  } else {
    next = `Think of a simple word for ${quoted(t.clue[0])} and one for ${quoted(t.clue[1])}.`;
  }
  const fill = free && !found[1] ? { box: 0, word: t.mid[0] } : null;
  return { message: [...said, next].join(" "), fill };
}

// One sentence about one word of the latest guess.
function feedback(t, history, word, box, color, bothFound) {
  const shown = upper(word);
  if (color === "green") return `${shown} is right!`;
  if (color === "lime") return `${shown} is in the answer, but it goes in the ${BOXES[1 - box]} box.`;
  if (color === "yellow") {
    const i = t.midSpellings.findIndex(spellings => spellings.includes(word));
    if (i < 0) return `${shown} is one of the synonyms.`;
    if (i === box) return `${shown} means ${quoted(t.clue[i])}.`;
    return `${shown} means ${quoted(t.clue[i])}, so it goes in the ${BOXES[i]} box.`;
  }
  if (word === t.literal[box] && word !== t.answer[box]) {
    return `${shown} sounds right! Spoonerisms go by sound, so spell it the usual way.`;
  }
  const triedBefore = history.slice(0, -1).some(h => h.words[box] === word);
  if (triedBefore) return `You already tried ${shown}.`;
  return bothFound ? `${shown} isn't in the answer.` : `${shown} isn't the one we want for ${quoted(t.clue[box])}.`;
}
