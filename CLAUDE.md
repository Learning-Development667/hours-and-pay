# Hours and Pay

A private ledger for Mark and Shelley: hours Mark works at MA Group, with live estimated take-home pay for each pay cycle and every income in one place (MA Group pay, a military pension, PIP). Two people only, each with their own sign-in. Not Daybook, not a Mark 1 Apps product: it never shares code, data or a Firebase project with Daybook.

## Brief (agreed 19 November 2026)
- **Who:** Mark and Shelley. Both can add, change and delete hours, and change settings. Nobody else can sign in.
- **What it does:** log hours by day; work out the hourly rate from the salary and contracted hours; estimate income tax and National Insurance; show a running total for the current pay cycle, the tax year and since tracking began; show the weekly aim against hours worked.
- **Pay cycle:** the 14th to the 13th, paid around the 25th of the month the cycle ends in.
- **Look:** premium. Deep navy, gold hairlines, Fraunces for figures and headings, Inter for text. Light and dark.
- **Not:** an App Store app, a payslip, or tax advice. It says so on the page.

## Working rules
- UK English. No em dashes anywhere a person reads.
- **No personal figures in this repository**: no salary, tax codes, pension, PIP amounts, hours, email addresses or names beyond "Mark" and "Shelley" in this file. They live in the database behind the sign-in. Tests use made-up figures.
- `config.js` holds only the public Firebase web settings. The database rules in the Firebase console hold the two real email addresses; `firestore.rules` here is the template with placeholders.
- Run `node --check` on every JS file before committing. Bump the `?v=` on `styles.css`, `calc.js`, `app.js` and `config.js` in `index.html` when they change.
- Test with `node tests/app-test.js` (headless Chromium with a stand-in Firebase; checks sign-in, set-up, add, edit, delete, settings, 390 dark and 320 light, no sideways scroll, controls 44px or more). Say plainly what was not tried on an iPhone.
- Anything that stops a save marks the field itself in red with "Missing information" or "Check this".
- Always give Mark the direct link to a console or settings page.

## Shape
- Plain HTML, CSS and JS, no build step. Firebase JS SDK v10 modular from gstatic (Auth email and password, Firestore). Fonts from Google Fonts. The Content Security Policy is in `index.html`.
- `index.html` (sign-in, the ledger, the Change hours, Settings and Set up sheets), `styles.css` (tokens at the top), `calc.js` (dates, pay cycles, tax and NI, the ledger; pure functions), `app.js` (sign-in, rendering, saving), `config.js`, `manifest.json` and the icons.
- **Firebase project:** Wage Tracker (`wage-tracker-69401`), Spark plan, Firestore in europe-west2 (London). Sign-up is switched off; the two users were added by hand.
- **Data:** `config/main` (salary, contracted hours, weekly aim, tax codes, payslip year-to-date figures, pension, PIP, the two names) and `hours/{id}` (`date` YYYY-MM-DD, `mins`, `note`, `by`, `at`).
- **Tax:** 2026 to 2027 rates for England. Codes ending Week1/Month1, W1/M1 or X are worked month by month; other codes use the year so far when the payslip's year-to-date figures are filled in, otherwise month by month. BR, D0, D1, NT, 0T and K codes are read.
- **First sign-in:** an empty database opens the Set up sheet, which takes a set-up code (base64 JSON of the settings and any hours) given to Mark privately, or Settings can be filled in by hand.

## Open
- Hosting: the repository is private, so GitHub Pages needs a paid plan. Decide the host (see the session of 19 November 2026).
- Nothing has been tried on an iPhone yet.
