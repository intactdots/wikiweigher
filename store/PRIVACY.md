# Privacy policy

Last updated: 2026-08-19

## The short version

This extension has no server, no account and no analytics. It does not collect, transmit or
sell anything about you. Everything it stores stays in your own browser.

## What it talks to

Two hosts, both public, both read anonymously:

- `*.wikipedia.org` - the MediaWiki API, to list an article's other languages and to measure
  each version's prose length and reference count.
- `www.wikidata.org` - to read Featured and Good article badges for those language versions.

Requests carry no identifier and no account. Every call sets `origin=*`, which tells the
MediaWiki API to answer anonymously and ignore any session you may be signed in to.

The extension itself requests data from no other host, and runs no server of its own.

Some buttons open a new tab, and only when you press them. The card's translate link opens
Google Translate with the public Wikipedia address of that article. The two Report a bug
buttons open either a prefilled GitHub issue or your mail app addressed to
support@intactdots.com, and you see the whole report first. The About page links to the
source repository, and the Rate link opens this extension's page on the Chrome Web Store.
Press none of them and none of those places is contacted.

## What it stores, and where

All of this is stored locally through the browser's extension storage. None of it leaves
your machine unless you choose to send a bug report or use Export settings, both described
below.

| Stored | Why |
| --- | --- |
| Your settings | Ranking weight, analysis depth, theme, accent, card language, reading languages, on/off |
| The card's position, and whether it starts minimized | So the card reappears where you left it |
| A measurement cache | So revisiting an article does not re-measure it; entries expire after 7 days, and the whole cache is dropped once the extension's local storage reaches 2 MB |
| Diagnostics from the last run | So a bug report can describe what actually happened |
| A recent debug log, up to 400 lines | What the extension did on each run, so a bug report can describe it. Only the error and warning lines are ever put into a report |
| Rating prompt state | How many articles have been ranked, and whether you already answered, so the review prompt is shown once and then respects your answer |
| The settings format version | So an update can migrate older settings instead of discarding them |
| A flag saying the extension just updated | So the toolbar icon can show a dot until you open it once |

## Permissions

- `storage` - to keep the settings and cache above.
- Host access to `*://*.wikipedia.org/*` - to read the article you are on and to call the
  Wikipedia API. The card is only ever shown on Wikipedia article pages; the script loads on
  `wikipedia.org/wiki/` addresses and does nothing at all on talk, user, category or special
  pages.

There is no `tabs` permission, no `history` and no `cookies`. Wikidata is read as an
anonymous cross-origin request, which needs no host permission of its own.

## Bug reports

Nothing is sent automatically. A report is only created when you press the button, and the
complete report is displayed to you before anything opens.

A report contains: the extension version, the wiki hostname (for example
`en.wikipedia.org`), the article title and language, your browser name and major version,
your operating system, the settings you changed from their defaults, what the extension
measured, and recent error messages.

A report never contains the full page address, your browsing history, your IP address, or
anything that identifies you.

## Children

The extension is not directed at children and collects nothing from anyone.

## Changes

Material changes to this policy will be noted in the changelog shipped with the extension.
