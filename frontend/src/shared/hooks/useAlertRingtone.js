import { useCallback, useEffect, useRef } from 'react';

/**
 * Looping alert ringtone for incoming-order popups (seller + delivery).
 *
 * The hard part is not playing the sound, it is being *allowed* to. Browsers and
 * Android/iOS WebViews block `audio.play()` that is not the direct result of a user
 * gesture. The previous implementation only reacted to that block: it called `play()`
 * when the order arrived, and - after it was rejected - started listening for a tap.
 * So the first order of a session rang only once the rider or seller had already
 * touched the screen, which is exactly when they no longer need an alert.
 *
 * This hook instead *primes* the element on the first user gesture after mount: it
 * plays it muted and immediately pauses. That one silent play grants the page media
 * permission, so every later `play()` - including one triggered by a socket event
 * while the user is idle - is allowed.
 *
 * Inside the Flutter wrapper the native side should also disable the gesture
 * requirement, which removes the need for priming entirely:
 *   Android: AndroidWebViewOptions(mediaPlaybackRequiresUserGesture: false)
 *   iOS:     InAppWebViewOptions(mediaTypesRequiringUserActionForPlayback: [])
 *   webview_flutter: AndroidWebViewController ... setMediaPlaybackRequiresUserGesture(false)
 *
 * @param {string} src              Audio file URL (bundled asset).
 * @param {object} [options]
 * @param {boolean} [options.enabled=true]  When false the hook stays dormant and silent.
 * @param {number}  [options.volume=1]
 */
export function useAlertRingtone(src, { enabled = true, volume = 1 } = {}) {
  const audioRef = useRef(null);
  const primedRef = useRef(false);
  const wantsToPlayRef = useRef(false);
  const retryHandlerRef = useRef(null);

  const getAudio = useCallback(() => {
    if (!audioRef.current && typeof Audio !== 'undefined' && src) {
      const audio = new Audio(src);
      audio.loop = true;
      audio.preload = 'auto';
      audio.volume = volume;
      audioRef.current = audio;
    }
    return audioRef.current;
  }, [src, volume]);

  const stop = useCallback(() => {
    wantsToPlayRef.current = false;
    const audio = audioRef.current;
    if (!audio) return;
    try {
      audio.pause();
      audio.currentTime = 0;
    } catch {
      /* a detached element can throw; nothing to do */
    }
  }, []);

  const play = useCallback(() => {
    if (!enabled) return;
    const audio = getAudio();
    if (!audio) return;
    wantsToPlayRef.current = true;
    audio.muted = false;
    audio.volume = volume;
    const attempt = audio.play();
    if (attempt?.catch) {
      attempt.catch((error) => {
        // Not fatal: the gesture listeners below retry as soon as the user touches
        // anything. Logged because a persistent block is worth seeing in the WebView.
        console.warn('[ringtone] blocked, waiting for a user gesture:', error?.name || error);
      });
    }
  }, [enabled, getAudio, volume]);

  // Prime on the first gesture, and double as a retry for a ring that was blocked.
  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return undefined;

    const GESTURE_EVENTS = ['pointerdown', 'touchstart', 'keydown', 'click'];

    const handler = () => {
      const audio = getAudio();
      if (!audio) return;

      // A ring is already wanted - just start it; this gesture authorises it.
      if (wantsToPlayRef.current) {
        audio.muted = false;
        audio.volume = volume;
        audio.play().catch(() => {});
        return;
      }

      if (primedRef.current) return;
      primedRef.current = true;

      // Silent unlock: play muted, then stop. Leaves no audible artefact.
      audio.muted = true;
      const attempt = audio.play();
      const settle = () => {
        try {
          audio.pause();
          audio.currentTime = 0;
        } catch {
          /* ignore */
        }
        audio.muted = false;
        audio.volume = volume;
      };
      if (attempt?.then) {
        attempt.then(settle).catch(() => {
          // Still blocked (rare) - allow another gesture to try again.
          primedRef.current = false;
          audio.muted = false;
        });
      } else {
        settle();
      }
    };

    retryHandlerRef.current = handler;
    for (const name of GESTURE_EVENTS) {
      window.addEventListener(name, handler, { capture: true, passive: true });
    }
    return () => {
      for (const name of GESTURE_EVENTS) {
        window.removeEventListener(name, handler, { capture: true });
      }
      retryHandlerRef.current = null;
    };
  }, [enabled, getAudio, volume]);

  // A WebView can pause media when the app is backgrounded; resume if a ring is still due.
  useEffect(() => {
    if (!enabled || typeof document === 'undefined') return undefined;
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      if (!wantsToPlayRef.current) return;
      const audio = audioRef.current;
      if (audio?.paused) audio.play().catch(() => {});
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [enabled]);

  // Never leave a ringtone looping after the layout unmounts.
  useEffect(() => stop, [stop]);

  // Going offline / switching role must silence an in-flight ring.
  useEffect(() => {
    if (!enabled) stop();
  }, [enabled, stop]);

  return { play, stop };
}

export default useAlertRingtone;
