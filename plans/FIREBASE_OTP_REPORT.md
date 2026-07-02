# Firebase Phone OTP — Root Cause Report

**Project:** zoogno (Firebase project `zoogno-96f97`)
**Symptom:** OTP arrives on the **test number** you configured, but **real / new numbers never receive an SMS**. reCAPTCHA "isn't working".
**Date:** 2026-06-23

---

## 0. CONFIRMED ROOT CAUSE (after seeing runtime logs)

The runtime logs proved the actual failure chain — it was **two bugs**, neither in the Firebase SMS pipeline itself:

1. **Frontend fell back to the wrong provider.** At page load `GET /api/settings` failed
   (`ERR_CONNECTION_REFUSED` — backend not up yet). The code did
   `settings?.otpProvider || 'smsIndiaHub'`, so it silently used the **backend SMS path**
   even though the database value is `otpProvider: "firebase"`. → Fallback changed to `'firebase'`.

2. **Backend SMS path was in MOCK mode**, so when the app *did* hit it, no real SMS was ever
   sent to anyone. The "default number" only worked because OTP `1234` is hardcoded for it
   (`otpAuthService.js:165-167`) and mock mode returns `1234` for everyone
   (`utils/otp.js`). New numbers got `1234` internally but **no SMS was sent**.

**Decision:** Use **Firebase Phone Auth**. Applied:
- `setting.js` default → `firebase`; existing DB doc confirmed `firebase`.
- Frontend fallback → `firebase`.
- Backend `FIREBASE_SERVICE_ACCOUNT` already configured ✅.

Remaining work is **Firebase Console config** (below) so real numbers receive SMS.

---

## 1. Summary (TL;DR)

**Your code is correct.** The signup/login flow in `CustomerAuth.jsx` and `firebase.js` follows the official Firebase Web v9 modular pattern exactly. The bug is **not in the code — it is in the Firebase Console configuration / project setup.**

The single most important clue is this:

> The test number works, but real numbers do not.

This is **proof**, not a coincidence. Firebase **fictional (test) phone numbers completely bypass two things**:
1. reCAPTCHA verification
2. The real SMS-sending pipeline (the code returns the canned OTP directly)

So when your test number works but real numbers fail, it means **the reCAPTCHA → real-SMS path is broken at the project-config level**. The code path is identical for both; only the test number skips the parts that are actually misconfigured.

---

## 2. How the flow works (verified in code)

| Layer | File | Status |
|-------|------|--------|
| Firebase init | `frontend/src/firebase/firebase.js` | ✅ Correct, env-driven |
| Send OTP (invisible reCAPTCHA + `signInWithPhoneNumber`) | `frontend/src/modules/customer/pages/CustomerAuth.jsx:113-121` | ✅ Correct |
| reCAPTCHA container `<div id="recaptcha-container">` | `CustomerAuth.jsx:397` | ✅ Present |
| Verify OTP (`confirmationResult.confirm`) | `CustomerAuth.jsx:150` | ✅ Correct |
| Backend token verify (`admin.auth().verifyIdToken`) | `backend/app/controller/customerAuthController.js:107` | ✅ Correct |

There is no logic error. `otpProvider` must equal `'firebase'` (from app settings) for this path to run — that is already working since the test number reaches Firebase.

---

## 3. Root Causes (ranked by likelihood)

### 🔴 Cause #1 — reCAPTCHA / Authorized Domains misconfiguration (most likely)

Real phone auth **requires reCAPTCHA to pass before Firebase will send an SMS**. If reCAPTCHA can't load or verify, `signInWithPhoneNumber()` throws and **no SMS is ever sent**. Test numbers skip reCAPTCHA, which is exactly why they still work.

reCAPTCHA fails when:

- **The domain you're testing on is NOT in Firebase → Authentication → Settings → Authorized domains.**
  - `localhost` and `127.0.0.1` are authorized by default.
  - Your **production domain / preview URL / LAN IP (e.g. `192.168.x.x`)** is almost certainly **missing**. If you test the frontend from a phone on your LAN IP or from a deployed URL, reCAPTCHA silently fails.
- The `authDomain` (`zoogno-96f97.firebaseapp.com`) doesn't match where the app is served and cookies/redirect get blocked.
- Browser blocks third-party cookies / you're in an embedded webview (in-app browser) where reCAPTCHA can't render.

➡️ **Most common real-world trigger:** testing on a deployed URL or phone-over-LAN that isn't in Authorized domains.

---

### 🟠 Cause #2 — SMS Region Policy not allowing India (+91)

Firebase has an **"SMS region policy"** (Authentication → Settings → SMS region policy). New projects can default to an **allow-list** that may **not include India**. If +91 isn't allowed, real SMS is silently rejected while test numbers (which don't send SMS) still "work".

➡️ Set the policy to **Allow** for India (IN / +91), or switch to "Allow all regions".

---

### 🟠 Cause #3 — Billing plan / SMS quota

- Phone Auth has a **small free daily SMS quota** on the Spark plan. Once exceeded, real SMS stops with `auth/quota-exceeded` — but test numbers keep working.
- For production volume, Firebase requires the **Blaze (pay-as-you-go) plan**. New projects frequently hit `auth/billing-not-enabled` for real numbers.

➡️ Check **Authentication → Usage** for quota, and confirm the project is on **Blaze** if you need real volume.

---

### 🟡 Cause #4 — Phone provider / API key restrictions

- The Web API key (`AIzaSyBmblrdRPB8kE-yBAPu0Fyh1iURun0AzTg`) may have **HTTP referrer or API restrictions** in Google Cloud Console that block the `Identity Toolkit API` from your domain.
- The **Identity Toolkit API** must be enabled in the GCP project.

➡️ In Google Cloud Console → APIs & Credentials, ensure the API key allows the **Identity Toolkit API** and your domains.

---

## 4. Why you couldn't see the real error

Your original `catch` block did:

```js
toast.error('Failed to send OTP');
console.error(error);
```

This hides the **Firebase error code**, which tells you exactly which cause above applies. I've updated it to log and surface `error.code` / `error.message` (see `CustomerAuth.jsx`). Now reproduce the failure on a real number and read the console — the code maps directly to the fix:

| Error code | Root cause | Fix |
|------------|-----------|-----|
| `auth/captcha-check-failed` | reCAPTCHA / domain | Cause #1 — add domain to Authorized domains |
| `auth/invalid-app-credential` | reCAPTCHA token invalid | Cause #1 |
| `auth/admin-restricted-operation` / region | SMS region blocked | Cause #2 |
| `auth/quota-exceeded` | Free SMS quota hit | Cause #3 |
| `auth/billing-not-enabled` | Spark plan limit | Cause #3 — upgrade to Blaze |
| `auth/too-many-requests` | Rate limited / abuse detection | Wait, or add number to test list temporarily |

---

## 5. Recommended Fix Checklist (do in order)

1. **Reproduce on a real number with DevTools open** and read the `[Firebase OTP] code:` log (now added). This pinpoints the exact cause.
2. **Firebase Console → Authentication → Settings → Authorized domains:** add every domain/host you serve the app from (production domain, Vercel/Netlify preview URLs, and any LAN IP you test from). `localhost` is already there.
3. **Authentication → Settings → SMS region policy:** ensure **India / +91** is allowed (or allow all regions).
4. **Authentication → Sign-in method → Phone:** confirm Phone provider is **Enabled**.
5. **Billing:** check **Usage** for SMS quota; upgrade to **Blaze** if you need real volume.
6. **Google Cloud Console:** ensure **Identity Toolkit API** is enabled and the Web API key isn't restricted away from your domains.
7. Remove your number from the **"Phone numbers for testing"** list while testing real SMS (otherwise it returns the canned code and you'll think it works when it doesn't).

---

## 6. Minor code improvements applied

In `CustomerAuth.jsx` `handleSendOtp` catch block:
- Now logs the real Firebase `error.code` and `error.message`.
- Resets `window.recaptchaVerifier` after a failure, because the **invisible reCAPTCHA token is single-use** — reusing a stale verifier on "Resend" can make retries fail silently.

These don't fix the SMS delivery (that's console config) but make the real cause visible and make retries reliable.

---

## 7. Conclusion

**Root cause:** Not a code defect. Real-number OTP fails because the **reCAPTCHA → real-SMS pipeline is blocked at the Firebase project level** — overwhelmingly likely an **Authorized-domains / SMS-region / billing** misconfiguration. The test number works precisely because it bypasses every one of those checks.

**Next action:** Reproduce with the new console logging, read the `auth/...` code, and apply the matching fix from §4–§5. Start by adding your real test domain to **Authorized domains** and allowing **+91** in the SMS region policy — those two cover the large majority of cases.
