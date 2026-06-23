import { useSettings } from '@core/context/SettingsContext';
import { Helmet } from 'react-helmet-async';

/**
 * Global SeoHead component providing base SEO settings.
 * Individual pages can override these using the <SEO> component.
 */
export default function SeoHead() {
    const { settings } = useSettings();

    if (!settings) return null;

    const title = settings.metaTitle || settings.appName || 'Appzeto';
    const desc = settings.metaDescription || '';
    const keywordsContent = (Array.isArray(settings.keywords) && settings.keywords.length)
        ? settings.keywords.join(', ')
        : (settings.metaKeywords || '');
    const faviconUrl = settings.faviconUrl || '/vite.svg';

    return (
        <Helmet defaultTitle={title} titleTemplate={`%s | ${settings.appName || 'Appzeto'}`}>
            <meta name="description" content={desc} />
            {keywordsContent && <meta name="keywords" content={keywordsContent} />}
            <link id="dynamic-favicon" rel="icon" type="image/x-icon" href={faviconUrl} />
            
            {/* Base OpenGraph */}
            <meta property="og:type" content="website" />
            <meta property="og:title" content={title} />
            <meta property="og:description" content={desc} />
            {settings.logoUrl && <meta property="og:image" content={settings.logoUrl} />}

            {/* Base Twitter */}
            <meta name="twitter:card" content="summary_large_image" />
            <meta name="twitter:title" content={title} />
            <meta name="twitter:description" content={desc} />
            {settings.logoUrl && <meta name="twitter:image" content={settings.logoUrl} />}
        </Helmet>
    );
}
