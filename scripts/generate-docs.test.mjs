import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { parse } from "yaml";

import {
  htmlCatalogRows,
  htmlInline,
  markdownTableCell,
  mdCatalogTable,
} from "./generate-docs.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("catalog HTML escapes text and attribute values", () => {
  const html = htmlCatalogRows(
    [
      {
        name: '<img src=x onerror="alert(1)">',
        url: 'https://example.com/?q="&a=1',
        author: "<strong>Author</strong>",
        domain: "<script>alert(1)</script>",
        description:
          'Read [<img src=x onerror="alert(1)">](https://example.com/?q="&a=1).',
      },
    ],
    true,
  );

  assert.match(html, /href="https:\/\/example\.com\/\?q=&quot;&amp;a=1"/);
  assert.match(html, /&lt;img src=x onerror="alert\(1\)"&gt;/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<img|<script/);
});

test("catalog HTML rejects unsafe link protocols", () => {
  assert.throws(
    () =>
      htmlCatalogRows(
        [
          {
            name: "unsafe-axi",
            url: "javascript:alert(1)",
            domain: "Test",
            description: "Test entry",
          },
        ],
        false,
      ),
    /Unsupported link URL protocol: javascript:/,
  );
  assert.throws(
    () => htmlInline("[unsafe](data:text/html,alert(1))"),
    /Unsupported link URL protocol: data:/,
  );
});

test("catalog HTML supports Markdown link destinations with parentheses", () => {
  assert.equal(
    htmlInline(
      "See [Function](https://en.wikipedia.org/wiki/Function_(mathematics)).",
    ),
    'See <a href="https://en.wikipedia.org/wiki/Function_(mathematics)">Function</a>.',
  );
  assert.equal(
    htmlInline("See [escaped](https://example.com/a\\(b\\))."),
    'See <a href="https://example.com/a(b)">escaped</a>.',
  );
});

test("catalog Markdown tables preserve pipes and multiline cells", () => {
  const markdown = mdCatalogTable(
    [
      {
        name: "example|axi",
        url: "https://example.com/a|b",
        author: "Example|Author",
        domain: "Example\nDomain",
        description:
          "Uses `a|b`, [a|b](https://example.com/a|b), and an escaped \\|.",
      },
    ],
    true,
  );

  assert.match(
    markdown,
    /^\| \[`example\\\|axi`\]\(https:\/\/example\.com\/a\\\|b\) \| Example\\\|Author \| Example Domain \| Uses `a\\\|b`, \[a\\\|b\]\(https:\/\/example\.com\/a\\\|b\), and an escaped \\|\. \|$/m,
  );
  assert.equal(markdownTableCell("already escaped \\|"), "already escaped \\|");
});

test("community catalog lands porkbun-axi with coolify-style admission exception", () => {
  const catalog = parse(readFileSync(join(root, "catalog.yaml"), "utf8"));
  const porkbun = catalog.community.find(
    (entry) => entry.name === "porkbun-axi",
  );
  assert.ok(porkbun, "porkbun-axi must be present in catalog.community");
  assert.equal(porkbun.author, "ardaatahan");
  assert.equal(porkbun.domain, "Domains / Porkbun");
  assert.equal(porkbun.url, "https://github.com/ardaatahan/porkbun-axi");

  assert.equal(porkbun.admission.status, "exception");
  assert.equal(
    porkbun.admission.reviewed_revision,
    "394fb206ea58c6d0aaa33a0f24bd6f70f84f206e",
  );
  for (const command of ["dns create", "forwarding create", "glue create"]) {
    assert.match(
      porkbun.admission.exception,
      new RegExp(`\`${command}\``),
      `admission.exception must document ungated \`${command}\``,
    );
  }

  const markdown = mdCatalogTable([porkbun], true);
  assert.match(
    markdown,
    /\[`porkbun-axi`\]\(https:\/\/github\.com\/ardaatahan\/porkbun-axi\)/,
  );

  const html = htmlCatalogRows([porkbun], true);
  assert.match(html, /href="https:\/\/github\.com\/ardaatahan\/porkbun-axi"/);
  assert.match(html, /<code>porkbun-axi<\/code>/);
});
