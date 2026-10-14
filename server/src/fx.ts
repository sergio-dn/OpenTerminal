// FX pairs as first-class symbols: searchable from the command palette,
// quotable through /api/quotes and chartable through /api/history, the same
// way crypto tickers are. Symbols use the Yahoo-style "USDCLP=X" form, which
// the web app's symbol validator already accepts.
//
// FX_IDC is TradingView's composite interbank feed, which covers the thinly
// traded LatAm crosses; FX:EURUSD is the liquid major. USD/ARS is the
// official rate (not the parallel "blue"/MEP rates), and USD/CNY is onshore —
// USD/CNH (offshore) is listed alongside it.

export type FxPair = {
  symbol: string;
  pair: string;
  name: string;
  ticker: string;
  base: string;
  quote: string;
  digits: number;
};

const CCY_NAMES: Record<string, string> = {
  USD: "U.S. Dollar",
  EUR: "Euro",
  CLP: "Chilean Peso",
  CNY: "Chinese Yuan",
  CNH: "Chinese Yuan (offshore)",
  MXN: "Mexican Peso",
  COP: "Colombian Peso",
  PEN: "Peruvian Sol",
  ARS: "Argentine Peso",
};

function pair(base: string, quote: string, ticker: string, digits: number): FxPair {
  return {
    symbol: `${base}${quote}=X`,
    pair: `${base}/${quote}`,
    name: `${CCY_NAMES[base]} / ${CCY_NAMES[quote]}`,
    ticker,
    base,
    quote,
    digits,
  };
}

export const FX_PAIRS: FxPair[] = [
  pair("USD", "CLP", "FX_IDC:USDCLP", 2),
  pair("EUR", "CLP", "FX_IDC:EURCLP", 2),
  pair("EUR", "USD", "FX:EURUSD", 5),
  pair("USD", "CNY", "FX_IDC:USDCNY", 4),
  pair("USD", "CNH", "FX_IDC:USDCNH", 4),
  pair("USD", "MXN", "FX_IDC:USDMXN", 4),
  pair("USD", "COP", "FX_IDC:USDCOP", 2),
  pair("USD", "PEN", "FX_IDC:USDPEN", 4),
  pair("USD", "ARS", "FX_IDC:USDARS", 2),
];

const BY_KEY = new Map<string, FxPair>();
for (const p of FX_PAIRS) {
  BY_KEY.set(p.symbol, p);
  BY_KEY.set(p.base + p.quote, p);
}

/** The FX pair behind a symbol ("USDCLP=X", or bare "USDCLP"), if any. */
export function fxPairFor(symbol: string): FxPair | undefined {
  return BY_KEY.get(symbol.trim().toUpperCase());
}

/**
 * Palette matches for free text like "usd/clp", "USDCLP", "clp" or
 * "chilean peso". Separators are ignored for code matches so every common
 * spelling of a pair resolves.
 */
export function searchFx(query: string): Array<{ symbol: string; name: string; exchange: string; type: string }> {
  const q = query.trim().toUpperCase();
  const code = q.replace(/[^A-Z]/g, "");
  if (code.length < 3) return [];
  return FX_PAIRS.filter((p) => {
    const pairCode = p.base + p.quote;
    return pairCode.includes(code) || (code.length > 6 && code.startsWith(pairCode)) || p.name.toUpperCase().includes(q);
  }).map((p) => ({ symbol: p.symbol, name: `${p.pair} — ${p.name}`, exchange: "FX", type: "forex" }));
}
