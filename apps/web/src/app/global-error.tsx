'use client';

import { useEffect, useState } from 'react';

/**
 * Last-resort boundary when the root layout itself fails. next-intl, fonts
 * and styles are not available here, so the six languages' copy is inline and
 * the language comes from the URL (/ar/…, /de/…).
 */
const COPY = {
  en: { title: 'Something went wrong', body: 'An unexpected error occurred. Please try again, or come back in a few minutes.', retry: 'Try again', home: 'Go home' },
  de: { title: 'Etwas ist schiefgelaufen', body: 'Ein unerwarteter Fehler ist aufgetreten. Bitte versuche es erneut oder komm in ein paar Minuten wieder.', retry: 'Erneut versuchen', home: 'Zur Startseite' },
  es: { title: 'Algo salió mal', body: 'Se produjo un error inesperado. Inténtalo de nuevo o vuelve en unos minutos.', retry: 'Reintentar', home: 'Ir al inicio' },
  fr: { title: 'Un problème est survenu', body: 'Une erreur inattendue s’est produite. Réessayez ou revenez dans quelques minutes.', retry: 'Réessayer', home: 'Accueil' },
  ar: { title: 'حدث خطأ ما', body: 'حدث خطأ غير متوقع. حاول مرة أخرى أو عد بعد بضع دقائق.', retry: 'حاول مرة أخرى', home: 'الصفحة الرئيسية' },
  ur: { title: 'کچھ غلط ہو گیا', body: 'ایک غیر متوقع خرابی پیش آئی۔ دوبارہ کوشش کریں یا چند منٹ بعد واپس آئیں۔', retry: 'دوبارہ کوشش کریں', home: 'ہوم پیج' },
} as const;
type Lang = keyof typeof COPY;

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const [lang, setLang] = useState<Lang>('en');
  useEffect(() => {
    console.error('[global error]', error);
    const first = window.location.pathname.split('/')[1] ?? '';
    if (first in COPY) setLang(first as Lang);
  }, [error]);
  const c = COPY[lang];
  const rtl = lang === 'ar' || lang === 'ur';
  return (
    <html lang={lang} dir={rtl ? 'rtl' : 'ltr'}>
      <body style={{ margin: 0, fontFamily: 'system-ui, -apple-system, Segoe UI, sans-serif', background: '#ffffff', color: '#10294f' }}>
        <main style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center' }}>
          <p style={{ fontSize: 14, fontWeight: 700, letterSpacing: 2, color: '#c2410c', margin: 0 }}>FLACRONCV</p>
          <h1 style={{ fontSize: 28, margin: '16px 0 8px' }}>{c.title}</h1>
          <p style={{ color: '#57534e', maxWidth: 420, lineHeight: 1.5, margin: 0 }}>{c.body}</p>
          <div style={{ display: 'flex', gap: 12, marginTop: 28, flexWrap: 'wrap', justifyContent: 'center' }}>
            <button
              type="button"
              onClick={reset}
              style={{ height: 48, padding: '0 28px', borderRadius: 999, border: 0, background: '#ea580c', color: '#fff', fontSize: 15, fontWeight: 600, cursor: 'pointer' }}
            >
              {c.retry}
            </button>
            <a
              href={`/${lang}`}
              style={{ height: 48, padding: '0 28px', borderRadius: 999, border: '1px solid #d6d3d1', color: '#1c1917', fontSize: 15, fontWeight: 600, display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}
            >
              {c.home}
            </a>
          </div>
          {error.digest ? <p style={{ marginTop: 24, fontFamily: 'monospace', fontSize: 12, color: '#a8a29e' }} dir="ltr">Ref: {error.digest}</p> : null}
        </main>
      </body>
    </html>
  );
}
