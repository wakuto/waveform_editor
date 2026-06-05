import React, { useEffect, useMemo, useState } from 'react';
import { I18nContext, type I18nContextValue, type Locale, STORAGE_KEY, interpolate, translations } from './i18n';

export const I18nProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
    const [locale, setLocale] = useState<Locale>(() => {
        const saved = localStorage.getItem(STORAGE_KEY);
        return saved === 'en' ? 'en' : 'ja';
    });

    useEffect(() => {
        localStorage.setItem(STORAGE_KEY, locale);
    }, [locale]);

    const value = useMemo<I18nContextValue>(() => ({
        locale,
        setLocale,
        t: (key, params) => interpolate(translations[locale][key], params),
    }), [locale]);

    return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
};
