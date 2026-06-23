import { auth, RecaptchaVerifier } from './firebase';

// Maps raw Firebase phone-auth error codes to user-friendly messages.
// The raw code is always logged to the console for debugging.
export const firebaseErrorMessage = (error) => {
    switch (error?.code) {
        case 'auth/invalid-phone-number':
            return 'Invalid phone number.';
        case 'auth/missing-phone-number':
            return 'Please enter a phone number.';
        case 'auth/captcha-check-failed':
        case 'auth/invalid-app-credential':
            return 'Verification failed. This domain may not be authorized in Firebase.';
        case 'auth/too-many-requests':
            return 'Too many attempts. Please try again later.';
        case 'auth/quota-exceeded':
            return 'SMS limit reached. Please try again later.';
        case 'auth/billing-not-enabled':
            return 'SMS service is not enabled for this project.';
        case 'auth/invalid-verification-code':
            return 'Incorrect OTP. Please check and try again.';
        case 'auth/code-expired':
            return 'OTP expired. Please request a new one.';
        default:
            return error?.message || 'Something went wrong. Please try again.';
    }
};

// Returns a singleton reCAPTCHA verifier, creating it once.
// Uses a VISIBLE ("normal") checkbox: invisible reCAPTCHA can hang forever on web
// phone-auth when Google wants to show a challenge it can't render.
export const getRecaptchaVerifier = () => {
    if (!window.recaptchaVerifier) {
        window.recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
            size: 'normal',
        });
    }
    return window.recaptchaVerifier;
};

// Clears the reCAPTCHA verifier so the next attempt starts fresh.
// The reCAPTCHA token is single-use; reusing a stale one fails silently.
export const resetRecaptcha = () => {
    if (window.recaptchaVerifier) {
        try { window.recaptchaVerifier.clear(); } catch { /* ignore */ }
        window.recaptchaVerifier = null;
    }
    const el = document.getElementById('recaptcha-container');
    if (el) el.innerHTML = '';
};
