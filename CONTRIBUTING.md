# Contributing

## Reporting a bug

Use the extension, not the issue form. Open Wikiweigher's settings, go to **Support**,
and under **Report a bug** press **Open a GitHub issue**. That fills in the diagnostics for you, and a report with
diagnostics gets fixed considerably faster than one without.

Disagreeing with which language was ranked best is not a bug. Open a Discussion with the
article and the two languages instead.

## Running it locally

```
npm install
npm run build
```

Then load the repository root as an unpacked extension at `chrome://extensions`.

Tests split by what they need:

| command | needs | runs on |
| --- | --- | --- |
| `npm run test:unit` | nothing | every change |
| `npm run test:browser` | Chrome, network | before a release |
| `npm run test:ux` | Chrome, network | before a release |
| `npm run test:settings` | Chrome, network | before a release |
| `npm run test:error` | Chrome, network | before a release |
| `npm run test:rate` | Chrome, network | before a release |
| `npm run test:pages` | Chrome | before a release |
| `npm run test:report` | Chrome, network | before a release |
| `npm run test:a11y` | Chrome, network | before a release |
| `npm run test:polish` | Chrome, network | before a release |
| `npm run test:a11y` | Chrome, network | before a release |
| `LIVE=1 npm run test:live` | network | occasionally |

Without `LIVE=1` the live tests silently skip and report as passing. The unit suite is
hermetic and must stay that way. Anything that reaches Wikipedia belongs
in a `pptr-*` sweep or in `test/live.test.js`.

## Where things are

Pure logic is kept away from anything touching the network or the DOM, so most of it is
testable without a browser.

| What | Where |
| --- | --- |
| The score and the verdict | `src/core/scorer.js` |
| What the card is told to show | `src/core/model.js` |
| Prose and reference extraction | `src/core/prose.js` |
| Word counting, including CJK | `src/core/wordcount.js` |
| Verbosity factors | `src/core/verbosity.js` |
| Settings validation and defaults | `src/settings/schema.js` |
| What a bug report may contain | `src/core/diagnostics.js` |
| The issue and mailto report | `src/core/report.js` |

## House rules

- No comments in extension source. If a line needs explaining, rename something.
- No em-dash or en-dash in text the user sees, in the UI or in logs.
- Commit messages start with `added:`, `fixed:`, `changed:` or `removed:`.
- Every non-trivial change leaves one runnable check behind.

## Adding a language

The card and the settings pages are translated by different mechanisms, on purpose.

**The card** follows the *article's* language, because someone reading Japanese Wikipedia
wants a Japanese card whatever their browser is set to. Its strings live in
`src/ui/i18n.js`, keyed by language code.

**The popup and settings pages** follow the *browser's* language, through Chrome's own
`_locales` mechanism. The welcome page is English only.

To translate the settings pages, copy `_locales/en/messages.json` to
`_locales/<code>/messages.json` and translate the `message` values. Leave the keys alone.

You do not have to translate everything. Chrome falls back to English per message, so a
file with ten translated labels works fine and helps immediately. The short labels are
worth more than the long explanations.

Run `npm run test:unit` afterwards. The locale test will tell you if a key does not exist.
