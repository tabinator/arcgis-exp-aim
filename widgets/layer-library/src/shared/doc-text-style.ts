export const docFontFamily = 'Mulish, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
export const libraryHeadingFontFamily = '"Libre Baskerville", Georgia, "Times New Roman", serif'

const fontLinkId = 'layer-library-doc-font'

export const ensureDocFontLoaded = () => {
  if (typeof document === 'undefined' || document.getElementById(fontLinkId)) return

  const preconnectGoogle = document.createElement('link')
  preconnectGoogle.rel = 'preconnect'
  preconnectGoogle.href = 'https://fonts.googleapis.com'
  document.head.appendChild(preconnectGoogle)

  const preconnectStatic = document.createElement('link')
  preconnectStatic.rel = 'preconnect'
  preconnectStatic.href = 'https://fonts.gstatic.com'
  preconnectStatic.crossOrigin = 'anonymous'
  document.head.appendChild(preconnectStatic)

  const fontLink = document.createElement('link')
  fontLink.id = fontLinkId
  fontLink.rel = 'stylesheet'
  fontLink.href = 'https://fonts.googleapis.com/css2?family=Libre+Baskerville:wght@400;700&family=Mulish:wght@300..900&display=swap'
  document.head.appendChild(fontLink)
}

export const docTextStyles = {
  shell: {
    fontFamily: docFontFamily,
    color: 'var(--sys-color-text-primary)',
    lineHeight: 1.45,
    WebkitFontSmoothing: 'antialiased',
    textRendering: 'optimizeLegibility'
  },
  title: {
    fontFamily: libraryHeadingFontFamily,
    fontSize: 15,
    fontWeight: 700,
    lineHeight: '21px',
    color: 'var(--sys-color-text-primary)',
    letterSpacing: 0
  },
  sectionTitle: {
    fontFamily: docFontFamily,
    fontSize: 13,
    fontWeight: 800,
    lineHeight: '18px',
    color: 'var(--sys-color-text-primary)',
    letterSpacing: 0
  },
  body: {
    fontFamily: docFontFamily,
    fontSize: 13,
    fontWeight: 500,
    lineHeight: '18px',
    color: 'var(--sys-color-text-primary)',
    letterSpacing: 0
  },
  muted: {
    fontFamily: docFontFamily,
    fontSize: 12,
    fontWeight: 600,
    lineHeight: '16px',
    color: 'var(--sys-color-text-secondary)',
    letterSpacing: 0
  },
  label: {
    fontFamily: docFontFamily,
    fontSize: 12,
    fontWeight: 700,
    lineHeight: '16px',
    color: 'var(--sys-color-primary-main, #007ac2)',
    letterSpacing: 0
  },
  badge: {
    fontFamily: docFontFamily,
    fontSize: 11,
    fontWeight: 800,
    lineHeight: '14px',
    color: 'var(--sys-color-primary-main, #007ac2)',
    background: 'color-mix(in srgb, var(--sys-color-primary-main, #007ac2) 10%, transparent)',
    border: '1px solid color-mix(in srgb, var(--sys-color-primary-main, #007ac2) 18%, transparent)',
    borderRadius: 999,
    padding: '2px 8px',
    letterSpacing: 0
  },
  categoryIcon: {
    fontFamily: docFontFamily,
    width: 28,
    height: 28,
    flex: '0 0 28px',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 5,
    border: '1px solid color-mix(in srgb, var(--sys-color-primary-main, #007ac2) 22%, var(--sys-color-divider, rgba(127, 127, 127, 0.35)))',
    background: 'color-mix(in srgb, var(--sys-color-surface-paper, transparent) 84%, var(--sys-color-primary-main, #007ac2) 16%)',
    color: 'var(--sys-color-primary-main, #007ac2)',
    fontSize: 14,
    fontWeight: 800,
    lineHeight: '16px',
    letterSpacing: 0,
    overflow: 'hidden'
  },
  button: {
    fontFamily: docFontFamily,
    fontSize: 11,
    fontWeight: 800,
    lineHeight: '14px',
    letterSpacing: 0
  }
}
