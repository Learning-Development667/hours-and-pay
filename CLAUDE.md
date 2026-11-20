# Hours and Pay

A private ledger for Mark and Shelley: hours Mark works at MA Group, with live estimated take-home pay for each pay cycle and every income in one place (MA Group pay, a military pension, PIP). Two people only, each with their own sign-in. Not Daybook, not a Mark 1 Apps product: it never shares code, data or a Firebase project with Daybook.

## Brief (agreed 19 November 2026)
- **Who:** Mark and Shelley. Both can add, change and delete hours, and change settings. Nobody else can sign in.
- **What it does:** log hours by day; work out the hourly rate from the salary and contracted hours; estimate income tax and National Insurance; show a running total for the current pay cycle, the tax year and since tracking began; show the weekly aim against hours worked.
- **Pay cycle:** the 15th to the 14th, paid on the 25th of the month the cycle ends in (hours from 15 Nov to 14 Dec are paid on 25 Dec; MA Group's October 2026 payroll paid hours up to 14 October in October). The military pension is paid on the 22nd; PIP every Tuesday. A pay date on a weekend or an England bank holiday is shown on the working day before (`workingDayOnOrBefore`, `BANK_HOLIDAYS` in `calc.js`, which needs the next year's dates adding each autumn).
- **Look:** premium. Deep navy, gold hairlines, Fraunces for figures and headings, Inter for text. Light and dark.
- **Not:** an App Store app, a payslip, or tax advice. It says so on the page.

## Working rules
- UK English. No em dashes anywhere a person reads.
- **No personal figures in this repository**: no salary, tax codes, pension, PIP amounts, hours, email addresses or names beyond "Mark" and "Shelley" in this file. They live in the database behind the sign-in. Tests use made-up figures.
- `config.js` holds only the public Firebase web settings. The database rules in the Firebase console hold the two real email addresses; `firestore.rules` here is the template with placeholders.
- **Version number:** bump `APP_VERSION` (and `APP_DATE`) in `app.js` and `version` in `version.json` together on every commit that changes the app. The footer and Settings show the version; when `version.json` on the site is newer than the open copy, a banner offers "Update now" (checked on opening, on returning to the app, and every 10 minutes).
- Run `node --check` on every JS file before committing. Bump the `?v=` on `styles.css`, `calc.js`, `app.js` and `config.js` in `index.html` when they change.
- Test with `node tests/app-test.js` (headless Chromium with a stand-in Firebase; checks sign-in, set-up, add, edit, delete, settings, 390 dark and 320 light, no sideways scroll, controls 44px or more). Say plainly what was not tried on an iPhone.
- Anything that stops a save marks the field itself in red with "Missing information" or "Check this".
- Always give Mark the direct link to a console or settings page.

## Shape
- Plain HTML, CSS and JS, no build step. Firebase JS SDK v10 modular from gstatic (Auth email and password, Firestore). Fonts from Google Fonts. The Content Security Policy is in `index.html`.
- `index.html` (sign-in, the ledger, the Change hours, Settings and Set up sheets), `styles.css` (tokens at the top), `calc.js` (dates, pay cycles, tax and NI, the ledger; pure functions), `app.js` (sign-in, rendering, saving), `config.js`, `manifest.json` and the icons.
- **Hosting:** GitHub Pages from `main`, root, at https://learning-development667.github.io/hours-and-pay/ (the repository is public, so nothing personal goes in it).
- **Firebase project:** Wage Tracker (`wage-tracker-69401`), Spark plan, Firestore in europe-west2 (London). Sign-up is switched off; the two users were added by hand.
- **Data:** `config/main` (salary, contracted hours, weekly aim, tax codes, monthly outgoings, payslip year-to-date figures, pension and the day of the month it is paid (`mpDay`), PIP and its weekday) and `hours/{YYYY-MM-DD}` (one document per day: `date`, `mins`, `shifts` [{`start`,`end`} as HH:MM], `note`, `at`). Older documents with random ids and no shifts are still read and are replaced when that day is saved.
- **Entering hours:** a calendar of the pay cycle, first on the page (beside the pay card on wide screens); tap a day to add up to six shifts (start and finish, same day, no overlaps). Who entered the hours is not recorded.
- **Pay:** hours at the hourly rate (salary / 52 / contracted hours, rounded to the penny as payroll does) plus Statutory Sick Pay: a day's rate for each weekday with no hours at all that sits in a run of four or more days in a row without work (weekends count; a day with any hours is not a sick day), from the SSP start date, at most 140 days (28 weeks of 5), counted only for days already passed (`sspDaySet`). The workplace pension is taken after tax (relief at source). Checked against the October 2026 payroll preview: same hours pay, tax and NI.
- **Monthly outgoings** (`config/main.outgoings`, a list of name and monthly amount): listed under the cycle's income with their total and what is left, marked Covered or Short. Edited in their own sheet.
- **This tax year** (`yearForecast` in `calc.js`): MA Group pay and tax to date from the payslip figures in Settings, then tracked cycles, then the weekly aim to April; the pension's year from its gross, with tax so far from Settings (`mpTaxYtd`) and the current code for the months left. Shown as one bar against the £12,570 and £50,270 lines, with the likely refund or amount owed after April. Ignores benefits and expenses in the code.
- **Tax:** 2026 to 2027 rates for England. Codes ending Week1/Month1, W1/M1 or X are worked month by month; other codes use the year so far when the payslip's year-to-date figures are filled in, otherwise month by month. BR, D0, D1, NT, 0T and K codes are read.
- **First sign-in:** an empty database opens the Set up sheet, which takes a set-up code (base64 JSON of the settings and any hours) given to Mark privately, or Settings can be filled in by hand.

## Open
- Nothing has been tried on an iPhone yet.
