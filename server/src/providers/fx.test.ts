import { afterEach, describe, expect, it, vi } from "vitest";
import { fxScan } from "./tradingview.js";
import { fromBoostr, fromMindicador } from "./clindicators.js";

function stubFetch(body: unknown, ok = true, status = 200) {
  const fetchMock = vi.fn().mockResolvedValue({ ok, status, json: async () => body });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fxScan", () => {
  it("batches every ticker into one forex scan and maps columns by position", async () => {
    const fetchMock = stubFetch({
      data: [
        { s: "FX_IDC:USDCLP", d: ["U.S. DOLLAR / CHILEAN PESO", 990.1, 3.9, 0.396, 986, 990.1, 985.2, 1.2, -0.5, 9.4, 3.1] },
        // A provider hiccup can leave cells null or non-numeric — never surface NaN.
        { s: "FX:EURUSD", d: ["EURO / U.S. DOLLAR", 1.11, null, "n/a", null, null, null, null, null, null, null] },
      ],
    });
    const rows = await fxScan(["FX_IDC:USDCLP", "FX:EURUSD", "FX_IDC:USDXXX"]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toContain("/forex/scan");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).symbols.tickers).toHaveLength(3);
    expect(rows.get("FX_IDC:USDCLP")).toMatchObject({ price: 990.1, change: 3.9, changePercent: 0.396, perfYtd: 9.4, perfYear: 3.1 });
    expect(rows.get("FX:EURUSD")).toMatchObject({ price: 1.11, change: null, changePercent: null });
    // Unknown tickers are absent rather than invented.
    expect(rows.has("FX_IDC:USDXXX")).toBe(false);
  });

  it("throws on a non-OK response so the route can fall back to stale data", async () => {
    stubFetch({}, false, 403);
    await expect(fxScan(["FX:EURUSD"])).rejects.toThrow("403");
  });
});

describe("dólar observado", () => {
  it("mindicador: returns the latest point and the series sorted ascending", async () => {
    stubFetch({
      serie: [
        { fecha: "2026-10-14T03:00:00.000Z", valor: 980.79 },
        { fecha: "2026-10-10T03:00:00.000Z", valor: 975.1 },
        { fecha: "2026-10-13T03:00:00.000Z", valor: 0 },
      ],
    });
    const o = await fromMindicador();
    expect(o).toMatchObject({ date: "2026-10-14", value: 980.79, source: "mindicador.cl" });
    // The zero (missing) observation is dropped, not plotted as a crash to 0.
    expect(o.series.map((p) => p.date)).toEqual(["2026-10-10", "2026-10-14"]);
  });

  it("mindicador: an empty series is an error, not a 0 rate", async () => {
    stubFetch({ serie: [] });
    await expect(fromMindicador()).rejects.toThrow("empty");
  });

  it("boostr: parses the latest value", async () => {
    stubFetch({ status: "success", data: { date: "2026-10-14", value: 980.79 } });
    await expect(fromBoostr()).resolves.toEqual({ date: "2026-10-14", value: 980.79, source: "api.boostr.cl", series: [] });
  });

  it("boostr: a 200 with status=error is treated as a failure", async () => {
    stubFetch({ status: "error", data: "", message: "Error el obtener el valor desde su origen" });
    await expect(fromBoostr()).rejects.toThrow("origen");
  });
});

describe("FX symbols", async () => {
  const { fxPairFor, searchFx } = await import("../fx.js");

  it("resolves Yahoo-style and bare pair codes, nothing else", () => {
    expect(fxPairFor("USDCLP=X")?.ticker).toBe("FX_IDC:USDCLP");
    expect(fxPairFor("usdclp")?.pair).toBe("USD/CLP");
    expect(fxPairFor("CLP")).toBeUndefined();
    expect(fxPairFor("AAPL")).toBeUndefined();
  });

  it("matches the common spellings typed into the palette", () => {
    expect(searchFx("usd/clp").map((r) => r.symbol)).toEqual(["USDCLP=X"]);
    expect(searchFx("USD CLP")[0]?.symbol).toBe("USDCLP=X");
    expect(searchFx("clp").map((r) => r.symbol)).toEqual(["USDCLP=X", "EURCLP=X"]);
    expect(searchFx("chilean peso").map((r) => r.symbol)).toContain("USDCLP=X");
    // Too short to mean a currency — don't hijack stock searches.
    expect(searchFx("us")).toEqual([]);
    expect(searchFx("AAPL")).toEqual([]);
  });
});

describe("currency-api history", async () => {
  const { datesFor, history } = await import("./currencyapi.js");

  it("samples daily for short ranges, weekly for long ones, never before the first published day", () => {
    const today = new Date("2026-10-14T15:00:00Z");
    const m = datesFor("1M", today);
    expect(m[m.length - 1]).toBe("2026-10-14");
    expect(m.length).toBe(32);
    expect(datesFor("YTD", today)[0]).toBe("2026-01-01");
    const max = datesFor("MAX", today);
    expect(max[0] >= "2024-03-02").toBe(true);
    expect(max.length).toBeLessThan(140);
  });

  it("builds base/quote candles from USD-based rates, skipping unpublished days", async () => {
    const byDate: Record<string, unknown> = {
      "2026-10-12": { usd: { clp: 980, eur: 0.9 } },
      "2026-10-13": { usd: { clp: 990, eur: 0.9 } },
      // 2026-10-14 not published yet -> 404
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        const date = Object.keys(byDate).find((d) => url.includes(d));
        return Promise.resolve(
          date ? { ok: true, status: 200, json: async () => byDate[date] } : { ok: false, status: 404, json: async () => ({}) }
        );
      })
    );
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-14T12:00:00Z"));
    try {
      const candles = await history("USD", "CLP", "1D");
      expect(candles.map((c) => c.close)).toEqual([980, 990]);
      // open = previous close, so the candle shows the day's direction.
      expect(candles[1]).toMatchObject({ open: 980, high: 990, low: 980, close: 990 });
      const eurclp = await history("EUR", "CLP", "1D");
      expect(eurclp[1].close).toBeCloseTo(1100, 6);
    } finally {
      vi.useRealTimers();
    }
  });
});
