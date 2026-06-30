const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  listSkillSuggestions,
  listFileSuggestions,
  parseSkillMetadata,
  expandSkillMentions,
  resolveSkillByName,
} = require("../server");

function makeWorkspace() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "remodex-mention-"));
  // Project-local skill so the test does not depend on the machine's global skills.
  const skillDir = path.join(root, ".codex", "skills", "demo-skill");
  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(
    path.join(skillDir, "SKILL.md"),
    [
      "---",
      'name: "demo-skill"',
      'description: "A demo skill used for testing the @ mention picker."',
      "---",
      "",
      "# Demo Skill",
    ].join("\n"),
    "utf8"
  );

  fs.writeFileSync(path.join(root, "readme.md"), "hello", "utf8");
  fs.mkdirSync(path.join(root, "web-client"), { recursive: true });
  fs.writeFileSync(path.join(root, "web-client", "server.js"), "// noop", "utf8");
  fs.mkdirSync(path.join(root, "node_modules"), { recursive: true });
  return root;
}

test("parseSkillMetadata reads quoted frontmatter", () => {
  const root = makeWorkspace();
  const meta = parseSkillMetadata(path.join(root, ".codex", "skills", "demo-skill", "SKILL.md"));
  assert.equal(meta.name, "demo-skill");
  assert.match(meta.description, /demo skill/i);
});

test("listSkillSuggestions finds project-local skills and filters by query", () => {
  const root = makeWorkspace();
  const all = listSkillSuggestions("", root, 20);
  const demo = all.find((item) => item.name === "demo-skill");
  assert.ok(demo, "expected demo-skill in suggestions");
  assert.equal(demo.kind, "skill");
  assert.ok(demo.path.endsWith("SKILL.md"));

  const filtered = listSkillSuggestions("demo-sk", root, 20);
  assert.ok(filtered.some((item) => item.name === "demo-skill"));

  const none = listSkillSuggestions("zzz-no-such-skill", root, 20);
  assert.ok(!none.some((item) => item.name === "demo-skill"));
});

test("listFileSuggestions lists working-directory entries, dirs first, ignoring node_modules", () => {
  const root = makeWorkspace();
  const suggestions = listFileSuggestions("", root, 20);
  const names = suggestions.map((item) => item.name);
  assert.ok(names.includes("web-client"));
  assert.ok(names.includes("readme.md"));
  assert.ok(!names.includes("node_modules"));

  const firstFileIndex = suggestions.findIndex((item) => item.kind === "file");
  const lastDirIndex = suggestions.map((item) => item.kind).lastIndexOf("directory");
  assert.ok(lastDirIndex < firstFileIndex, "directories should sort before files");
});

test("listFileSuggestions drills into subdirectories and stays contained", () => {
  const root = makeWorkspace();
  const nested = listFileSuggestions("web-client/", root, 20);
  assert.ok(nested.some((item) => item.path === "web-client/server.js"));

  const escaped = listFileSuggestions("../", root, 20);
  assert.deepEqual(escaped, []);
});

test("expandSkillMentions appends a SKILL.md instruction block", () => {
  const root = makeWorkspace();
  const expanded = expandSkillMentions("please @skill:demo-skill and continue", root);
  assert.match(expanded, /`demo-skill`/);
  assert.match(expanded, /read each SKILL\.md/i);
  assert.match(expanded, /SKILL\.md/);
  assert.ok(!expanded.includes("@skill:"), "raw token should be rewritten");
});

test("expandSkillMentions leaves text untouched when no skill token is present", () => {
  const root = makeWorkspace();
  const text = "just a normal @web-client/server.js mention";
  assert.equal(expandSkillMentions(text, root), text);
});

test("resolveSkillByName resolves by directory name and skill name", () => {
  const root = makeWorkspace();
  const resolved = resolveSkillByName("demo-skill", root);
  assert.ok(resolved);
  assert.ok(resolved.path.endsWith("SKILL.md"));
});
