# Mobile device checklist (V1 app + career tools)

Nothing below has been run on a phone or simulator. Code-level checks only so far: type-check, lint, 48 unit tests, and a local Android JavaScript bundle. Use fictional accounts from `demo-credentials.txt` against the local stack, or staging. Setup: `C:\Users\win 11\FlacronCV-integration-local\README.txt` → "Mobile". Build with `EXPO_PUBLIC_CAREER_ENABLED=true` for the career rows and `false` once to confirm they disappear.

| # | Check | Expected result |
|---|---|---|
| 1 | Cold start, signed out | Onboarding or sign-in; no crash; no career entry anywhere when the flag is off |
| 2 | Sign in as **pro**, kill the app, reopen | Still signed in (SecureStore session restored); dashboard loads |
| 3 | Dashboard → Career tools (flag on) as **pro** | "Career tools are not included in your plan", optional add-on with own credits; no price, no buy button, no link |
| 4 | Same as **career** | "Career Professional", **TEST ENTITLEMENT** badge, "not a purchase"; 60 document credits left |
| 5 | Same as **free** and **admin** | Free: not included. Admin: not included (operator rights do not grant career access) |
| 6 | Settings → Billing (flag on) | V1 plan section unchanged; "Career tools add-on" card with status only |
| 7 | Career profile: confirm a draft fact, remove a fact | Confirm disabled while fields are missing; remove asks first; list updates |
| 8 | Career drafts → open CV draft, edit a line | "Unsaved changes" subtitle; Save/Discard bar; Share buttons hidden until saved |
| 9 | Edit, press Home, return after 1 minute | Edits still there with "restored" note; nothing saved automatically |
| 10 | Edit, airplane mode, Save | "No connection. Nothing was saved…"; text kept; Save again after reconnecting works |
| 11 | Edit the same draft on the website, then save on the phone | "This draft changed somewhere else… your edit was not saved"; text kept |
| 12 | Share PDF and Share DOCX | System share sheet; file name is a timestamp plus the document title (accents simplified); file opens in Files/Drive; no copy left in app cache afterwards |
| 13 | Letter editor: edit, save, reopen | Saved text shown after reopening |
| 14 | Saved opportunities | Read-only list; "No live job feed is connected"; empty state when none |
| 15 | Keyboard on small screen (iPhone SE / 360 dp Android) | Text fields stay visible above the keyboard; bottom bar not covered; safe areas respected |
| 16 | Sign out, sign in as **free** on the same device | No CVs, letters, jobs or career data from the previous account visible, even briefly |
| 17 | Session expiry (revoke via "Sign out everywhere" on the web) | Once the current ID token expires (up to about an hour), the next request returns to sign-in; no stale data shown afterwards |
| 18 | Settings → Your data → Download my data | Share sheet with a JSON file; temp copy removed afterwards |
| 19 | Settings → Your data → Delete account with **del1** | Requires typing DELETE; then signed out to the login screen; signing in again fails; career data erased (check on the API) |
| 20 | Delete account while offline | "Not deleted…"; still signed in; retry works when online |
| 21 | Notification permission denied (Settings → push toggle) | Explanation shown; toggle stays off; app keeps working |
| 22 | Dark mode on the device | App stays in its light theme (V1 app is light-only); text readable |
| 23 | Device language Arabic/Urdu | App stays English and left-to-right (V1 app is English-only); no layout breakage |
| 24 | VoiceOver/TalkBack on Career overview | Headings announced; tappable rows announced as buttons; "On the website / Not available yet / Desktop only" items not announced as buttons |
| 25 | iOS store build | Keep `EXPO_PUBLIC_CAREER_ENABLED` off until a Career in-app subscription exists (Apple 3.1.3(b), see `V2_INTEGRATION.md` §0.5) |
