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
