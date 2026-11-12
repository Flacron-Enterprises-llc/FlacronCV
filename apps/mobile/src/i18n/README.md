# App translations (`src/i18n`)

The app ships the website's six languages: `en`, `es`, `fr`, `de`, `ar`, `ur`
(`ar` and `ur` are right-to-left). English is the source; every other file must
have exactly the same keys.

## Files

| File | What it is |
| --- | --- |
| `locales/<locale>/<namespace>.json` | The messages. One file per namespace per locale. |
| `messages.ts` | **Generated** static imports of every file (Metro only bundles static imports). Never edit; run `npm run i18n:index`. |
| `config.ts` | Locales, RTL list, native language names, device-locale matching. Pure. |
| `format.ts` | `{name}` placeholders and ICU `plural` / `select`. Pure. |
| `core.ts` | Current-locale store, `t()`, `translate()`, `hasKey()`. Pure. |
| `useT.ts` | `useT(namespace?)` and `useLocale()` hooks. |
| `intl.ts` | `formatNumber`, `formatDate`, `formatCurrency` in the current locale. |
| `native.ts` | React Native only: AsyncStorage copy of the language, `I18nManager` direction, profile sync, `RTL_FLIP`. |
| `index.ts` | Pure public entry (everything except `native.ts`). |

Import from `src/i18n` everywhere. Import `src/i18n/native` only from `app/`
screens/layouts — never from `src/lib` (it pulls in React Native and breaks
vitest).

## Using it

```tsx
import { useT } from '../../src/i18n';

const t = useT('settings');          // keys inside settings.json
const tc = useT('common');           // shared words
t('profile.title');                  // settings.profile.title
t('password.sentBody', { email });   // "We sent a password reset link to {email}"
const tp = useT('settings.profile'); // a sub-path works too: tp('title')
```

- **Keys are string literals in single quotes** — `t('profile.title')`. The
  key-resolve test only checks literals. For a key built at runtime
  (`` `status.${s}` ``) check `hasKey('settings.billing.status.' + s)` first and
  fall back to the raw value; keep every possible value in `en`.
- **Outside React** (lib helpers, text built after an `await`): `import { t } from '…/src/i18n'`
  and use fully qualified keys: `t('settings.billing.history.title')`. It
  reads the current language at call time. Example: `src/lib/billing-history.ts`.
- **After `changeLanguage()` in the same handler**, the hook's `t` still holds
  the old language; use the plain `t` (imported as `tNow`) for any Alert shown
  afterwards (see `settings/index.tsx` `onPickLanguage`).
- **Module-level constants** (zod schemas, option lists) are evaluated once in
  English. Build them inside the component (`useMemo(() => makeSchema(t('…')), [t])`)
  or store keys and translate at render.
- Missing key → English → the key itself. Never throws; a `__DEV__` warning is logged.
- Numbers/dates: `formatNumber(n)`, `formatDate(date)`, `formatCurrency(19.99, 'usd')`.
  English stays `en-US` ("Jan 5, 2026", "$19.99"). For Firestore timestamps
  call `formatDate(toDate(value))` (`toDate` is in `src/lib/utils`).

## Message syntax (same as the website files)

- Placeholders: `"Type {keyword} to confirm"` → `t('…', { keyword })`.
- Plurals: `"{count, plural, =0 {No CVs} one {# CV} other {# CVs}}"`. `#` is the
  number. Arabic may add `zero`, `two`, `few`, `many`; any category you leave
  out falls back to `other`, so `one`/`other` always works.
- Select: `"{kind, select, cv {CV} other {document}}"`.
- Not supported: apostrophe quoting, `offset:`, `selectordinal`, `{n, number}`.
  Format numbers with `formatNumber` and pass the string.
- Do not concatenate sentence fragments with leading spaces in JSON. Keep whole
  sentences and join them in code (`[a, b].filter(Boolean).join(' ')`).

## Adding a namespace (one per feature area, so agents never share a file)

1. Pick a camelCase name for the feature: `cvs`, `coverLetters`, `jobs`,
   `auth`, `dashboard`, `career`, `templates`, `support`, `tour`, `components` …
   The file name is the first segment of every key (`cvs.list.empty`).
2. Create `locales/en/<ns>.json` with the English text **exactly as the screen
   shows it today** (English UI must not change). Nest by screen/section:
   `{ "list": { "title": "My CVs", "empty": "…" } }`. Keys are camelCase.
3. Create the same file in `es`, `fr`, `de`, `ar`, `ur` with identical keys.
4. Run `npm run i18n:index` (regenerates `messages.ts`). If two branches both
   regenerated it and conflict, take either side and run the script again.
5. Convert the screen to `useT('<ns>')`, then run the gates below.

`common` (owned by settings work) holds only shared words — `cancel`, `save`,
`delete`, `remove`, `close`, `back`, `ok`, `later`, `retry`, `loading`,
`pleaseTryAgain`, `noConnection`, `unsaved.{title,body,stay,leave}`. Read it;
do not add to it from a feature branch — put feature words in your namespace.

## Reusing the website's translations

The website's messages are in `apps/web/public/locales/<locale>/common.json`
(one big file: `settings.*`, `billing.*`, `dashboard.*`, `cv_builder.*`,
`coverLetters.*`, `jobs.*`, `templates.*`, `tour.*`, `common.*` …).

- When the app's English matches a web string (same text or same meaning),
  copy that key's five translations — the web's terminology is the product's
  (e.g. "Engine Credits", "Mis CVs", "Bewerbungs-Tracker").
- Translate new strings yourself in natural UI language that matches those
  terms (informal "tú"/"du" as the web does; "vous" in French).
- Keep every `{placeholder}` and `{x, plural, …}` argument identical to `en`.
  The keyword-type strings (`settings.data.keyword` = DELETE/ELIMINAR/…) come
  from the web so the same word works on both.
- Quick lookup: `node -e "const j=require('./apps/web/public/locales/fr/common.json');console.log(j.settings.account)"`.

## Right-to-left (ar, ur)

React Native fixes the layout direction when the JS bundle starts.
`native.ts` calls `I18nManager.allowRTL(rtl)` + `I18nManager.forceRTL(rtl)`
(both, so an Arabic-language phone never mirrors an English app):

- at startup (`bootstrapI18n()` in `app/_layout.tsx`), for the saved language;
- when the user picks a language in Settings (`changeLanguage()`); if the
  direction changes, Settings tells the user to close and reopen the app
  (in `__DEV__` it offers `DevSettings.reload()`); text switches immediately;
- when the signed-in profile's `preferences.language` differs
  (`adoptProfileLanguage()`); no prompt, the direction applies next launch.

**Layout rules for every screen you convert:**

- Use logical sides, never left/right: NativeWind `ms-* me-* ps-* pe-*`
  (margin/padding start/end) instead of `ml-* mr-* pl-* pr-*`; in style objects
  `marginStart`, `marginEnd`, `paddingStart`, `paddingEnd`, `start`, `end`.
  For absolutely positioned items use `start-*` / `end-*` classes or
  `style={{ start: 0 }}` / `style={{ end: 0 }}` instead of `left-0` / `right-0`.
- `flex-row` already mirrors in RTL — don't reverse rows by hand.
- Icons that point a direction (`chevron-forward`, `chevron-back`,
  `arrow-back`, `arrow-forward`, `log-out-outline`, send arrows…) get
  `style={RTL_FLIP}` from `src/i18n/native` (it is `I18nManager.isRTL`-based).
  Symmetric icons (checkmark, close, settings) are left alone.
- Don't use `text-left` / `textAlign: 'left'` (or right). Leave the default
  (`'auto'`), which follows the layout direction; `text-center` is fine.
- A string that mixes scripts (an endonym list, an email inside Arabic text)
  is still readable without a restart; set `writingDirection` only for text
  that is entirely in the other script (see the language picker).

## Language source of truth

Same as the website: the signed-in user's `preferences.language`
(`PATCH /users/me/preferences { language }`, allowed values `en es fr de ar ur`
— API `@IsEnum(Locale)`). Before sign-in, or until the profile loads: the
language last chosen on this device (AsyncStorage `flacroncv.language`) →
the device language if shipped (`Intl.DateTimeFormat().resolvedOptions().locale`;
expo-localization is not installed) → English. Settings saves to the profile
and the device; a failed save reverts the language.

## Test gates (`npx vitest run` in apps/mobile; `npx tsc --noEmit` must be clean)

- `locales.test.ts` — every locale has every namespace and exactly the `en`
  keys; values are non-empty strings; placeholders and plural/select arguments
  match `en`; no non-`en` value equals English unless it is in
  `SAME_AS_ENGLISH` with a reason (brands, plan names, words the language
  spells the same — use `locale:key` when only one language is affected);
  stale allow-list entries fail; `messages.ts` matches the folder.
- `keys-resolve.test.ts` — every literal key used with a `useT` variable or an
  imported `t` in `app/` and `src/` exists in `en`. Add your converted screens
  to the "scan reaches" list if you want them pinned.
- `i18n.test.ts` — formatting, plural rules (checked against
  `Intl.PluralRules`), fallback, locale matching, Intl helpers.

A failure means: fix the translation file. Never weaken a check or edit `en`
to make another locale pass.
