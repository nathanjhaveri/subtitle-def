#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { get } from "node:https";
import { basename, dirname, resolve } from "node:path";
import { gzipSync } from "node:zlib";

const SOURCE_URL = "https://www.reader-dict.com/file/fr/dict-fr-fr-noetym.df.bz2";
const DEFAULT_SOURCE = "/tmp/dict-fr-fr-noetym.df.bz2";
const DEFAULT_OUTPUT = "assets/dictionary/fr-fr-v1.js";
const WRAP_AT = 16 * 1024;

function usage() {
  console.log("Usage: node scripts/build-dictionary.mjs [source.df.bz2] [output.js]");
}

function download(url, destination) {
  return new Promise((resolveDownload, reject) => {
    const chunks = [];
    get(url, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`Download failed with HTTP ${response.statusCode}`));
        return;
      }
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        writeFileSync(destination, Buffer.concat(chunks));
        resolveDownload();
      });
    }).on("error", reject);
  });
}

function normalizeWord(value) {
  return value.normalize("NFC").trim().toLocaleLowerCase("fr");
}

function addLookup(lookup, key, entryIndex) {
  const normalized = normalizeWord(key);
  if (!normalized) return;
  const existing = lookup[normalized];
  if (existing === undefined) {
    lookup[normalized] = entryIndex;
  } else if (typeof existing === "number") {
    if (existing !== entryIndex) lookup[normalized] = [existing, entryIndex];
  } else if (!existing.includes(entryIndex)) {
    existing.push(entryIndex);
  }
}

function parseDictFile(text) {
  const entries = [];
  const lookup = Object.create(null);
  let current = null;

  const finish = () => {
    if (!current?.head || !current.html) return;
    const entryIndex = entries.length;
    entries.push([current.head, current.html]);
    addLookup(lookup, current.head, entryIndex);
    for (const alias of current.aliases) addLookup(lookup, alias, entryIndex);
  };

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    if (line.startsWith("@ ")) {
      finish();
      current = { head: line.slice(2).trim(), aliases: [], html: "" };
    } else if (current && line.startsWith("& ")) {
      current.aliases.push(line.slice(2).trim());
    } else if (current && line.startsWith("<html>")) {
      current.html = line.slice(6).trim();
    }
  }
  finish();

  return { entries, lookup };
}

function dictionaryScript(compressed) {
  const encoded = compressed.toString("base64");
  const chunks = [];
  for (let i = 0; i < encoded.length; i += WRAP_AT) {
    chunks.push(encoded.slice(i, i + WRAP_AT));
  }
  return [
    "(function () {",
    "  const chunks = [",
    ...chunks.map((chunk) => `    ${JSON.stringify(chunk)},`),
    "  ];",
    "  const base64 = chunks.join(\"\");",
    "  if (typeof window.__subtitleDefDictionaryDataLoaded === \"function\") {",
    "    window.__subtitleDefDictionaryDataLoaded(base64);",
    "  } else {",
    "    window.__subtitleDefDictionaryDataBase64 = base64;",
    "  }",
    "}());",
    ""
  ].join("\n");
}

async function main() {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    usage();
    return;
  }

  const sourcePath = resolve(process.argv[2] || DEFAULT_SOURCE);
  const outputPath = resolve(process.argv[3] || DEFAULT_OUTPUT);

  if (!existsSync(sourcePath)) {
    if (sourcePath !== DEFAULT_SOURCE) {
      throw new Error(`Dictionary source not found: ${sourcePath}`);
    }
    console.log(`Downloading ${SOURCE_URL}`);
    await download(SOURCE_URL, sourcePath);
  }

  console.log(`Reading ${sourcePath}`);
  const dictText = execFileSync("bzip2", ["-dc", sourcePath], { maxBuffer: 220 * 1024 * 1024 }).toString("utf8");
  const { entries, lookup } = parseDictFile(dictText);
  const payload = {
    v: 1,
    format: "subtitle-def-dictionary",
    source: basename(sourcePath),
    sourceUrl: SOURCE_URL,
    generatedAt: new Date().toISOString(),
    e: entries,
    l: lookup
  };
  const json = JSON.stringify(payload);
  const compressed = gzipSync(json, { level: 9 });
  const script = dictionaryScript(compressed);

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, script);

  console.log(`Entries: ${entries.length.toLocaleString()}`);
  console.log(`Lookup keys: ${Object.keys(lookup).length.toLocaleString()}`);
  console.log(`JSON: ${(json.length / 1_000_000).toFixed(1)} MB`);
  console.log(`Gzip: ${(compressed.length / 1_000_000).toFixed(1)} MB`);
  console.log(`Script: ${(script.length / 1_000_000).toFixed(1)} MB`);
  console.log(`Wrote ${outputPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
