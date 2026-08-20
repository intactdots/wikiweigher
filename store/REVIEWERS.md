# Building this add-on

This archive is the source for the Wikiweigher Firefox add-on. It contains no minified,
obfuscated or vendored code, and the extension has no runtime dependencies.

## Build

```
npm ci
node scripts/build-firefox.mjs
```

That writes a `firefox/` directory, which is the submitted package. Compare it against the
uploaded package; the contents should match file for file.

The build needs Node and nothing else. It writes no archive and shells out to no other tool.

## Environment

| | Used to produce the upload | Reviewer default |
| --- | --- | --- |
| OS | Windows 11 | Ubuntu 24.04 LTS |
| CPU | x64 | ARM64 |
| Node | 24.16.0 | 24.14.0 |

esbuild is the only build dependency and its exact version is pinned in `package-lock.json`,
which `npm ci` installs. Its output for a given input and version does not vary by operating
system or CPU architecture, so building on the reviewer default reproduces the same two files.
Rebuilding on the same machine is likewise byte-identical.

## What the build does

1. Bundles `src/content/main.js` and `src/background.js` into `firefox/dist/` with esbuild, as
   readable IIFE files. No minification, no transpilation, no name mangling, no obfuscation.
2. Writes `firefox/manifest.json` from the repository manifest, replacing
   `background.service_worker` with `background.scripts`, since Gecko runs an event page, and
   adding `browser_specific_settings.gecko`.
3. Copies every file the manifest actually references, resolved by walking imports, HTML
   `src` and `href` attributes and `runtime.getURL()` calls outward from the manifest. Files
   reachable only through the two bundled entry points are deliberately left out, so no source
   is shipped twice.

Nothing else is altered. The extension API is read through `src/core/ext.js`, which resolves to
`browser` on Firefox and `chrome` elsewhere, so one source runs on both.

## One shared source, two stores

The same source builds the Chrome and Firefox packages, so `src/core/rate.js` carries a branch
for each store's review page. `src/core/ext.js` decides which applies by checking whether
`runtime.getURL('')` returns a `moz-extension://` URL, so the Chrome branch never runs on
Firefox. The Firefox review link is empty until the add-on has a listing slug, so this build
shows no rating prompt and no rating link at all.

## Testing

No account, credentials or configuration are required. Open any Wikipedia article that exists
in more than one language, for example:

    https://en.wikipedia.org/wiki/Chernobyl_disaster

A card appears at the top right within a few seconds and ranks the article's other language
versions by prose length and reference count.

## Network activity

Two public hosts, both read anonymously with `origin=*`:

- `*.wikipedia.org` - the MediaWiki API, to list an article's languages and measure each one.
- `www.wikidata.org` - Featured and Good article badges, as a cross-origin request.

No other host is contacted. No remote code is loaded or executed. Nothing is transmitted to any
developer-operated endpoint. Settings, cache and the local debug log stay in `storage.local`.

Two buttons open a new tab, and only when pressed: a Google Translate link for an article the
user does not read, and a bug report the user reads in full before sending.
