import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'

const BASE_URL = 'https://chipicocoa.github.io/artale-efficiency/'

export function useDocumentMeta() {
  const { t, i18n } = useTranslation()

  useEffect(() => {
    const lang = i18n.language

    // Update <html lang>
    document.documentElement.lang = lang

    // Update <title>
    document.title = t('app.title')

    // Update <meta name="description">
    let metaDesc = document.querySelector('meta[name="description"]')
    if (!metaDesc) {
      metaDesc = document.createElement('meta')
      metaDesc.setAttribute('name', 'description')
      document.head.appendChild(metaDesc)
    }
    metaDesc.setAttribute('content', t('seo.description'))

    // Only update URL query param if already present (set by explicit user choice)
    const url = new URL(window.location.href)
    if (url.searchParams.has('lang')) {
      url.searchParams.set('lang', lang)
      window.history.replaceState(null, '', url.toString())
    }

    // Update hreflang alternate links
    const languages = ['en', 'zh-TW']
    for (const lng of languages) {
      const id = `hreflang-${lng}`
      let link = document.getElementById(id) as HTMLLinkElement | null
      if (!link) {
        link = document.createElement('link')
        link.id = id
        link.rel = 'alternate'
        link.hreflang = lng
        document.head.appendChild(link)
      }
      link.href = `${BASE_URL}?lang=${lng}`
    }

    // x-default hreflang — bare URL lets detector choose
    let xDefault = document.getElementById('hreflang-x-default') as HTMLLinkElement | null
    if (!xDefault) {
      xDefault = document.createElement('link')
      xDefault.id = 'hreflang-x-default'
      xDefault.rel = 'alternate'
      xDefault.hreflang = 'x-default'
      document.head.appendChild(xDefault)
    }
    xDefault.href = BASE_URL
  }, [t, i18n.language])
}
