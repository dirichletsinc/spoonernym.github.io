// Loaded in <head> so the theme is set before first paint: saved choice, else the system setting.
(() => {
  const read = key => { try { return localStorage.getItem(key); } catch { return null; } };
  const root = document.documentElement;
  const systemDark = matchMedia("(prefers-color-scheme: dark)").matches;
  root.dataset.theme = read("spoonernym:theme") || (systemDark ? "dark" : "light");
  if (read("spoonernym:cb") === "1") root.dataset.cb = "1";
})();
