// Extract the human prompts and Claude's text replies from Claude Code transcripts (one Markdown file per session),
// so new user rules and corrections can be folded back into this skill.
// Tool calls, tool results, sidechains (subagents) and meta messages are skipped; IDE-attachment and
// system-reminder blocks are stripped. Compaction summaries are kept (they list "All user messages").
//
// usage:
//   node extract-transcripts.js <transcriptDir> <outDir> [--since YYYY-MM-DD]
//   node extract-transcripts.js C:\Users\User\.claude\projects\c--maven-business-agent C:\Temp\lydia-sessions --since 2026-11-11
// Then read the USER sections first: look for "以后/记得/不要/先…再…", corrections, and approvals ("可以/确认/就这样实现").
// The output contains private conversation text: write it to a temp/scratch folder, never into the git repo.
const fs = require("fs");
const path = require("path");

const [dir, out, ...rest] = process.argv.slice(2);
if (!dir || !out) { console.error("usage: node extract-transcripts.js <transcriptDir> <outDir> [--since YYYY-MM-DD]"); process.exit(2); }
const sinceIdx = rest.indexOf("--since");
const since = sinceIdx >= 0 ? rest[sinceIdx + 1] : "";
fs.mkdirSync(out, { recursive: true });

const strip = (t) =>
  t
    .replace(/<ide_opened_file>[\s\S]*?<\/ide_opened_file>/g, "")
    .replace(/<ide_selection>[\s\S]*?<\/ide_selection>/g, "[ide_selection]")
    .replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, "")
    .trim();

const summary = [];
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".jsonl"))) {
  const lines = fs.readFileSync(path.join(dir, f), "utf8").split("\n").filter(Boolean);
  const items = [];
  const seen = new Set();
  let title = "", first = null;
  for (const l of lines) {
    let o;
    try { o = JSON.parse(l); } catch { continue; }
    if (o.type === "ai-title") title = o.aiTitle || o.title || title;
    if (o.isSidechain || o.isMeta || !o.message) continue;
    if (o.type !== "user" && o.type !== "assistant") continue;
    if (o.uuid) { if (seen.has(o.uuid)) continue; seen.add(o.uuid); }
    const c = o.message.content;
    const parts = typeof c === "string" ? [{ type: "text", text: c }] : Array.isArray(c) ? c : [];
    if (o.type === "user") {
      if (parts.some((p) => p.type === "tool_result")) continue;
      const text = strip(parts.filter((p) => p.type === "text").map((p) => p.text).join("\n"));
      const imgs = parts.filter((p) => p.type === "image").length;
      if (!text && !imgs) continue;
      const isCmd = /^<command-(name|message|args)>|^<local-command-stdout>/.test(text) && text.length < 400;
      if (!isCmd && !first) first = o.timestamp;
      items.push({ ts: o.timestamp, who: isCmd ? "CMD" : "USER", text: text + (imgs ? `\n[${imgs} image(s) attached]` : "") });
    } else {
      const text = parts.filter((p) => p.type === "text").map((p) => p.text).join("\n").trim();
      if (text) items.push({ ts: o.timestamp, who: "CLAUDE", text });
    }
  }
  if (since && (!first || first.slice(0, 10) < since)) continue;
  const id = f.replace(".jsonl", "");
  const md = [`# Session ${id}`, `title: ${title}`, `first: ${first}`, ""];
  for (const it of items) md.push(`## [${it.ts}] ${it.who}`, it.text, "");
  fs.writeFileSync(path.join(out, `${(first || "x").slice(0, 10)}_${id}.md`), md.join("\n"));
  const users = items.filter((i) => i.who === "USER");
  summary.push({ id, title, first, userMsgs: users.length, userChars: users.reduce((a, b) => a + b.text.length, 0) });
}
summary.sort((a, b) => String(a.first).localeCompare(String(b.first)));
console.table(summary);
