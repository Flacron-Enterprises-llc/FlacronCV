# Site audit — open findings

Multi-agent audit, 2026-07-31. 8 dimensions, 47 findings confirmed by independent
verifiers (12 refuted). The money, moderation, quota and data-loss defects are fixed;
these 30 remain, ordered by severity.

## [MEDIUM] Role changes never revoke the old token, so a promoted admin gets 403 on every admin/CRM call while a demoted one keeps admin access

**Where:** `apps/api/src/modules/crm/crm-users.service.ts:124`

**Impact:** A newly promoted admin is shown an admin panel in which nothing works and no error explains why; a demoted admin retains real API-level admin access (customer PII, audit logs, subscription mutation) for up to an hour after the operator believes they revoked it.

**Fix:** In both `CrmUsersService.updateUserRole` and `AuthService.setUserRole`, follow `setCustomUserClaims` with `await this.firebase.auth.revokeRefreshTokens(uid)` and have the guard verify with revocation checking, forcing the target's client to obtain a token carrying the new claim. Alternatively have `AuthProvider.syncUser` call `getIdToken(true)` when the Firestore role disagrees with the token claim, so UI and API agree.

## [MEDIUM] ~~Export quota is charged before the file is generated — a failed export still burns one of a free user's 2 monthly exports~~ **FIXED 2026-08-19**

**Where:** `apps/api/src/modules/export/export.service.ts` (`recordClientExport`)

**Was:** `/exports/record` incremented before client render; failed html2canvas/jsPDF left Free users charged with no file (lifetime 2 after F.3, not monthly).

**Fix:** Transactional reserve + `export_reservations/{id}`; `POST /exports/confirm` after successful production (DOCUMENT_EXPORTED moves here); dedicated `POST /exports/refund` on catch (idempotent, floor at 0). Same §15 principle as AI credits.

## [MEDIUM] Section titles cannot be edited anywhere — an added "Custom" section is permanently titled "Custom"

**Where:** `apps/web/src/components/cv-builder/CVEditor.tsx:363`

**Impact:** Anyone who adds the Custom section — the whole point of which is a user-named block ("Publications", "Volunteering") — gets a CV with a heading that literally says "Custom" and no way to change it. Renaming "Experience" to "Professional Experience" is likewise impossible.

**Fix:** Add an `<Input>` for `section.title` in the section header (or at the top of `SectionContent`) wired to `updateSection(section.id, { title })`.

## [MEDIUM] A section deleted while an autosave is in flight is never deleted server-side and reappears on reload

**Where:** `apps/web/src/store/cv-store.ts:159`

**Impact:** A deleted section silently comes back — in the editor and in the exported PDF — after a page reload. The window is the duration of one autosave request, which on a slow connection is easily long enough to click a delete button in.

**Fix:** Prune `persistedSectionIds` against the save's snapshot, not live state: `markSectionsPersisted(snapshotIds)` should only remove ids that were in `snapshot.persistedSectionIds` AND absent from `snapshot.sections` (i.e. the ones actually DELETEd this round), leaving concurrently-removed ids in place for the next pass.

## [MEDIUM] A CV cannot be renamed after creation

**Where:** `apps/web/src/components/cv-builder/toolbar/EditorToolbar.tsx:91`

**Impact:** A typo or a placeholder name chosen at creation ("Untitled CV") is permanent, and it becomes the filename of every PDF the user sends to employers. The only workaround is Duplicate, which produces "… (Copy)" and consumes another CV from the plan quota.

**Fix:** Make the toolbar `<h2>` an inline-editable input (or add a rename action to the CV list card) wired to a new `updateTitle` store action; autosave already persists it.

## [MEDIUM] Editor 'AI Improve' never sends linkedCVId, so the regenerated letter is written with zero CV context — and it costs a credit

**Where:** `apps/web/src/app/[locale]/(dashboard)/cover-letters/[id]/page.tsx:283`

**Impact:** Clicking 'AI Improve' on a letter that was created linked to a CV silently replaces a CV-grounded letter with a generic one containing no experience, skills or education — and spends an AI credit doing it. The confirm modal warns the content will be replaced but not that it will be replaced with something less personalised.

**Fix:** Send `linkedCVId: coverLetter?.linkedCVId || undefined` from the editor, and make the server fall back too: `const linkedCVId = data.linkedCVId || cl.linkedCVId;` at cover-letter.service.ts:277, matching the existing fallbacks on lines 271-273.

## [MEDIUM] AI generation is offered without checking the cover-letter quota — the credit is spent on a draft that cannot be saved

**Where:** `apps/web/src/app/[locale]/(dashboard)/cover-letters/new/page.tsx:222`

**Impact:** A FREE user at their letter limit spends an AI credit (and 15-30s of waiting) on a letter they can never save. The draft only lives in component state, so navigating away or refreshing destroys it. The comment at line 148-152 claims 'a failed generation therefore leaves no empty document and no consumed cover-letter quota behind' — but the credit is genuinely gone here because the generation succeeded.

**Fix:** Check the cover-letter quota alongside `ensureAICredits()` in `startGeneration` and `createBlank`, opening the UpgradeModal before spending anything. Additionally, map the 403 from `saveDraftMutation` to the UpgradeModal instead of a raw English toast so the draft is not stranded behind an untranslated error.

## [MEDIUM] Plan feature bullets on pricing, billing and the paywall render hardcoded English in all six locales

**Where:** `packages/shared-types/src/subscription.types.ts:89`

**Impact:** An Arabic, Urdu, Spanish, French or German user reaches the exact screen where they decide to pay and the list of what they get is entirely in English — on the public pricing page, on the in-app billing upgrade cards, and inside the paywall modal that interrupts them mid-task. The surrounding chrome is translated, so it reads as a broken page rather than a deliberate choice.

**Fix:** Replace the `features: string[]` literals with translation keys (e.g. `featureKeys: ['billing.features.cvs_5', …]`) and resolve them with `t()` at each of the four render sites, or add a `featuresLocalized: Record<string,string[]>` alongside the existing `nameLocalized` pattern already used for templates. `billing.features.*` keys already exist in `common.json` for the comparison table, so the vocabulary is largely there.

## [MEDIUM] Network, timeout and offline error messages are hardcoded English and surface directly in user-facing toasts and alert cards

**Where:** `apps/web/src/lib/api.ts:108`

**Impact:** At the moment a user's work fails to save or an AI generation dies, the only explanation they get — including the reassurance that their work was saved — is in a language they may not read. This is the highest-anxiety moment in the product.

**Fix:** Have `ApiError` carry its `kind` (it already does) and let call sites translate on `kind` rather than printing `.message`: e.g. `toast.error(e instanceof ApiError && e.kind !== 'http' ? t(`errors.${e.kind}`) : e.message)`. Add `errors.offline` / `errors.timeout` / `errors.network` to all six locale files. Server-supplied `body.message` (line 126) needs a parallel decision — either a translated fallback or an error-code contract from the API.

## [MEDIUM] DOCX-is-paid and the monthly export quota are unenforceable — the file is produced in the browser and the server only sees a self-declared format string

**Where:** `apps/api/src/modules/export/export.service.ts:71`

**Impact:** The DOCX-export paywall — a headline Pro/Enterprise differentiator listed in every plan's feature bullets — and the free plan's 2-exports/month cap can both be bypassed by anyone willing to open devtools. Free accounts get unlimited PDF and DOCX exports, removing a primary reason to upgrade.

> **Cadence in the sentence above is stale (2026-08-22).** Free exports never
> reset; they are not `/month`. Leave the rest of this finding as written —
> it is a historical enforcement note. Cadence truth: `PLAN_CONFIGS` /
> `ARCHITECTURE_MAP.md` §8 Tier 4.

**Fix:** Make the server the producer for gated formats: route DOCX through the existing server-side `exportCVToDocx` / `exportCoverLetterToDocx` (which already call `checkDocxAccess`) rather than generating it in the browser, and keep client-side generation for the free PDF path only. If client-side DOCX must stay, the honest position is that DOCX cannot be paywalled and the quota is advisory — say so in the code comment rather than claiming enforcement.

## [LOW] /admin and /crm strand the user on an unbreakable spinner whenever the account sync never succeeds

**Where:** `apps/web/src/app/[locale]/(crm)/layout.tsx:31`

**Impact:** During an API outage, any admin (or any user who typed the URL) who lands on /admin or /crm sees a spinner that never stops, with no error text, no navigation and no way to sign out — the tab is effectively dead until they hand-edit the URL.

**Fix:** Bound the placeholder state: after the retry budget is exhausted, render an explicit error panel ("We couldn't load your account") with Retry and Sign out actions inside the layout instead of the bare spinner, and let a confirmed non-admin (real synced role) still be redirected. Keep the no-redirect behaviour only while retries are still in flight.

## [LOW] CRM user CSV export ignores the response status and saves the error body as platform-users.csv

**Where:** `apps/web/src/app/[locale]/(crm)/crm/users/page.tsx:164`

**Impact:** The Export CSV button silently produces a corrupt file containing a JSON error message instead of data, or does nothing at all when the network is down. The operator has no indication the export failed until they open the file.

**Fix:** Route this through the existing `apps/web/src/lib/download-csv.ts` helper, or add `if (!res.ok) { toast.error(...); return; }`, wrap the body in try/catch with a toast on failure, and `URL.revokeObjectURL` after the click.

## [LOW] Sign out awaits a 15-second API call with no pending state, so the button appears dead

**Where:** `apps/web/src/providers/AuthProvider.tsx:295`

**Impact:** On a degraded API, clicking Sign out does nothing visible for up to 15 seconds on a still-live dashboard. On a shared machine the user may walk away believing they signed out.

**Fix:** Sign out locally first (or race the audit call against a ~2s timeout) so `signOut(auth)` is never blocked by the API: `void api.post('/auth/logout').catch(() => {}); await signOut(auth);`. Add a `loggingOut` state to TopBar that disables the button and shows a spinner, and wrap `handleLogout` in try/catch with an error toast.

## [LOW] Registration issues two concurrent /auth/verify calls that can both create the account and send duplicate verification emails

**Where:** `apps/web/src/providers/AuthProvider.tsx:251`

**Impact:** On sign-up the user may receive two identical verification emails (hurting sender reputation and looking broken), and the audit trail gets duplicate REGISTERED rows for a single registration.

**Fix:** Make `verifyAndSync` create the user inside a Firestore transaction (or `.create()` and catch ALREADY_EXISTS) so only one caller takes the new-user branch and fires the verification email. On the client, de-duplicate concurrent `/auth/verify` calls in `AuthProvider` by sharing a single in-flight promise instead of letting `register` and `syncUser` both post.

## [LOW] ~~Export quota is spent before the browser generates the file, with no refund when generation fails~~ **FIXED 2026-08-19**

Same defect as the MEDIUM above (duplicate finding). Reserve → confirm / refund.

## [LOW] Billing page shows the 'plan activated' success banner even when session verification failed

**Where:** `apps/web/src/app/[locale]/(dashboard)/settings/billing/page.tsx:57`

**Impact:** A user whose payment succeeded at Stripe but whose plan did not sync (verify-session error and webhook not yet delivered or failing) is told 'Plan activated' while still on Free limits, so they do not contact support and instead hit quota errors.

**Fix:** Only set `syncSuccess` when the refreshed user actually holds a paid plan; otherwise show a 'we're still confirming your payment / contact support' state.

## [LOW] Navigating away with unsaved work flushes fire-and-forget with no backup and no error surfaced

**Where:** `apps/web/src/app/[locale]/(dashboard)/cv/[id]/page.tsx:111`

**Impact:** Unsaved edits vanish with no warning and no recovery path when leaving the editor on an unreliable connection — the user believes it saved because nothing said otherwise.

**Fix:** Call `writeBackup(cvId, {...})` before firing the flush requests (so the next open restores them via the existing backup path at :184-229), and use `navigator.sendBeacon` / `keepalive: true` so the requests survive the navigation.

## [LOW] A section id that exists client-side but not server-side wedges autosave in a permanent failure loop that survives reload

**Where:** `apps/api/src/modules/cv/cv.service.ts:596`

**Impact:** A user with the editor open on two devices gets a permanent "Autosave failed" banner and their section edits stop persisting, with reloading making it worse rather than better.

**Fix:** Make `updateSection` upsert (`.set(updateData, { merge: true })`) so a re-created section heals itself, or have the client treat a 404/NOT_FOUND on a section PUT as "this id is stale" — drop it from `persistedSectionIds` and POST it instead of retrying forever.

## [LOW] Photo upload silently does nothing when the image fails to decode or FileReader errors

**Where:** `apps/web/src/components/cv-builder/CVEditor.tsx:83`

**Impact:** A user selects a corrupt or unsupported-but-correctly-typed image (e.g. a CMYK JPEG, or a .png that is actually something else), and the avatar simply never appears — no error, no spinner, nothing to retry against.

**Fix:** Add `reader.onerror` and `img.onerror` handlers that set `photoError` / `toast.error` with the same message the other failure branches use, and guard the 2d context instead of asserting it.

## [LOW] Projects / Certifications / Languages / References sections expose only Title and Description — the date the template renders is unreachable

**Where:** `apps/web/src/components/cv-builder/CVEditor.tsx:469`

**Impact:** A user adding a Certifications section can enter the certificate name and a blurb but cannot state when they earned it — the field is rendered by the template and is simply always blank. Same for project dates.

**Fix:** Add a date input (and, where the renderer reads them, issuer/proficiency) to the generic branch, or give certifications/projects/languages their own field sets the way experience and education have.

## [LOW] ~~Export quota is consumed before the file is generated — a failed client-side export burns one of the FREE plan's 2 monthly exports~~ **FIXED 2026-08-19**

Same defect (cover-letter editor path). Reserve → confirm / refund on both CV toolbar and cover-letter editor.

## [LOW] 'AI Improve' on a letter with no job title or company spends a credit generating a letter about nothing

**Where:** `apps/web/src/app/[locale]/(dashboard)/cover-letters/[id]/page.tsx:249`

**Impact:** One click, no warning, one AI credit gone (FREE users get 5) and the letter is filled with generic filler addressed to no company. The new 'Letter details' panel now exposes jobTitle/companyName in the editor, but the AI button does not require them.

**Fix:** Gate `handleAIImprove` on `coverLetter.jobTitle?.trim() && coverLetter.companyName?.trim()`; when missing, open the Letter details panel (`setDetailsOpen(true)`) and toast `coverLetters.ai_fields_required` rather than spending a credit.

## [LOW] Any load failure on a support ticket renders 'Ticket not found' with no retry

**Where:** `apps/web/src/app/[locale]/(dashboard)/support/[id]/page.tsx:142`

**Impact:** A user whose network hiccups while opening a support ticket is told their ticket does not exist. There is no retry; they must navigate back and click in again, and a transient failure reads as data loss on the one page people go to when something is already wrong.

**Fix:** Read `isError`/`refetch` from the query and render a retry state (reuse the pattern in cover-letters/[id]/page.tsx:406-424), reserving the 'not found' copy for a successful response with no ticket.

## [LOW] Draft/Final badge on cover-letter cards can never say 'Final' — nothing in the app sets status

**Where:** `apps/web/src/app/[locale]/(dashboard)/cover-letters/page.tsx:155`

**Impact:** Every cover letter shows a 'Draft' badge forever. The badge implies a workflow the user can advance and there is no control anywhere to advance it, so the column is pure noise and users may believe a finished letter is somehow incomplete.

**Fix:** Either add a Draft/Final toggle in the editor toolbar (the PUT already accepts `status`), or drop the badge from the card until that control exists.

## [LOW] AI generate can race the 2s autosave and lose either the generated content or edits made just before the response

**Where:** `apps/web/src/app/[locale]/(dashboard)/cover-letters/[id]/page.tsx:290`

**Impact:** In case (a), a letter-details edit made moments before the AI finishes silently disappears. In case (b), the user sees their AI-generated letter on screen, the indicator says saved, and the credit is spent — but a reload restores the pre-generation text.

**Fix:** Disable the letter-details/styling inputs (or at least suppress the autosave cancel) while `aiMutation.isPending`, and merge the AI response into the store rather than replacing it wholesale — keep locally-dirty fields and leave `isDirty` set so the pending autosave still flushes. A version/updatedAt check on the PUT would close the lost-update window.

## [LOW] Every user-facing date in the dashboard is formatted with a hardcoded en-US / en-GB locale

**Where:** `apps/web/src/lib/utils.ts:26`

**Impact:** Non-English users see US-formatted English dates throughout their CV list, cover-letter list, job tracker and support tickets. For German, French and Spanish users the day/month order convention differs from what they expect; for Arabic and Urdu users a Latin-script English month abbreviation appears inside otherwise RTL text, which also disrupts the bidi run.

**Fix:** Give both helpers a required locale argument sourced from `useLocale()` / `getLocale()` (the billing page already does this correctly for currency at `settings/billing/page.tsx:91`), or replace the call sites with next-intl's `useFormatter().dateTime()`, which is locale-aware by construction. For `formatRelative`, pass the matching `date-fns/locale` import.

## [LOW] Auth pages show 'All rights reserved.' in hardcoded English despite a translated key existing

**Where:** `apps/web/src/app/[locale]/(auth)/layout.tsx:31`

**Impact:** Every non-English visitor sees an English legal footer on the first screen of the product, next to an otherwise fully translated brand panel.

**Fix:** Change line 31 to `&copy; {new Date().getFullYear()} FlacronCV. {t('footer.rights')}` — note the layout's translator is bound to the `auth` namespace (`getTranslations('auth')` at line 6), so this needs a second bare `getTranslations()` or a fully-qualified call.

## [LOW] CV template names and descriptions render in English everywhere, even though localized names are stored and served

**Where:** `apps/web/src/app/[locale]/(public)/templates/page.tsx:486`

**Impact:** On the two screens where a user picks a design — the public gallery and the first step of CV creation — every card title and blurb is English while the badges and filters around them are translated. Search on that page also only matches English (`page.tsx:211` builds its haystack from `tmpl.name` + `tmpl.description`), so an Arabic user cannot find a template by typing its Arabic name.

**Fix:** Read `template.nameLocalized[locale] ?? template.name` at both render sites and in the search haystack. Add a matching `descriptionLocalized` to the seed data and `TemplateModel`, or move descriptions into `common.json` keyed by slug.

## [LOW] The landing page emits English metadata title and description for every locale

**Where:** `apps/web/src/app/[locale]/page.tsx:18`

**Impact:** Browser tab titles, bookmark names, and every social/messaging link preview for the localized home page are English for Spanish, French, German, Arabic and Urdu users, and the page competes in search under English text only.

**Fix:** Use the existing helper: `const t = await getTranslations({ locale, namespace: 'hero' }); return pageMetadata({ locale, path: '', title: t(...), description: t(...) })`. The English-only FAQ JSON-LD at `:59-112` is annotated as an intentional crawl-language choice, but note it now contradicts the visible translated `<FAQ />` component on non-English locales, which search engines treat as a structured-data mismatch.

## [LOW] CRM "reactivate user" leaves a self-deleted account disabled in Firebase Auth — the user can never sign in again

**Where:** `apps/api/src/modules/crm/crm-users.service.ts:195`

**Impact:** A customer who asks to have their account restored is told by support that it is restored, and still cannot log in. Support has no working remediation in the product at all — the only fix is a manual edit in the Firebase console. Combined with the fact that all their documents survive the soft delete, this looks to the customer like their paid data has been destroyed.

**Fix:** Re-enable the Auth account in `reactivateUser`, mirroring the disable in `softDelete`: ```ts try { await this.firebase.auth.updateUser(uid, { disabled: false }); } catch (err) { this.logger.error(`Failed to re-enable Firebase Auth for ${uid}: ${(err as Error).message}`); } ``` Because `suspendUser` should also start disabling the Auth account (see the separate suspension finding), this call is required for both undo paths.
