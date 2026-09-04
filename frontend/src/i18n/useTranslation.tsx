import { createContext, useContext, type ReactNode } from "react";

import type { Locale } from "./locale";
import { translate, type MessageKey, type TranslateVars } from "./translations";

const LocaleContext = createContext<Locale>("en");

export function LocaleProvider({
  locale,
  children,
}: {
  locale: Locale;
  children: ReactNode;
}) {
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}

export function useLocale(): Locale {
  return useContext(LocaleContext);
}

export function useTranslation() {
  const locale = useLocale();
  const t = (key: MessageKey, vars?: TranslateVars) => translate(locale, key, vars);
  return { t, locale };
}
