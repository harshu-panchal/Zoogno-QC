import React from 'react';
import { Helmet } from 'react-helmet-async';
import { useSettings } from '@core/context/SettingsContext';

/**
 * SEO Component
 * @param {string} title - Page title
 * @param {string} description - Page description
 * @param {string} keywords - Comma separated keywords
 * @param {string} image - URL to image for OpenGraph
 * @param {string} url - Canonical URL
 */
const SEO = ({ title, description, keywords, image, url }) => {
    const { settings } = useSettings();

    // Fallbacks to global settings
    const siteName = settings?.appName || 'Appzeto';
    const seoTitle = title ? `${title} | ${siteName}` : (settings?.metaTitle || siteName);
    const seoDescription = description || settings?.metaDescription || '';
    
    let seoKeywords = keywords || '';
    if (!seoKeywords) {
        seoKeywords = (Array.isArray(settings?.keywords) && settings?.keywords.length)
            ? settings.keywords.join(', ')
            : (settings?.metaKeywords || '');
    }

    const seoImage = image || settings?.logoUrl || '';

    return (
        <Helmet>
            {/* Basic Meta Tags */}
            <title>{seoTitle}</title>
            <meta name="description" content={seoDescription} />
            {seoKeywords && <meta name="keywords" content={seoKeywords} />}

            {/* Open Graph / Facebook */}
            <meta property="og:type" content="website" />
            {url && <meta property="og:url" content={url} />}
            <meta property="og:title" content={seoTitle} />
            <meta property="og:description" content={seoDescription} />
            {seoImage && <meta property="og:image" content={seoImage} />}

            {/* Twitter */}
            <meta name="twitter:card" content="summary_large_image" />
            {url && <meta property="twitter:url" content={url} />}
            <meta name="twitter:title" content={seoTitle} />
            <meta name="twitter:description" content={seoDescription} />
            {seoImage && <meta name="twitter:image" content={seoImage} />}
        </Helmet>
    );
};

export default SEO;
