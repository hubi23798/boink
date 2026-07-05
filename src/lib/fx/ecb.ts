const DAILY_URL = "https://www.ecb.europa.eu/stats/eurofx/eurofxref/eurofxref-daily.xml";
const HIST_URL = "https://www.ecb.europa.eu/stats/eurofx/eurofxref/eurofxref-hist.xml";

export interface EcbRate {
  date: string; // YYYY-MM-DD
  currency: string;
  rate: number; // ECB reference rate: 1 EUR = `rate` units of `currency`
}

function parseXml(xml: string, since?: string): EcbRate[] {
  const results: EcbRate[] = [];
  const dateRe = /<Cube time="(\d{4}-\d{2}-\d{2})">([\s\S]*?)<\/Cube>/g;
  const rateRe = /currency="([A-Z]+)" rate="([0-9.]+)"/g;
  let dm: RegExpExecArray | null;

  while ((dm = dateRe.exec(xml)) !== null) {
    const date = dm[1]!;
    if (since && date < since) continue;

    // EUR/EUR is always 1 (base currency)
    results.push({ date, currency: "EUR", rate: 1 });

    const block = dm[2]!;
    let rm: RegExpExecArray | null;
    rateRe.lastIndex = 0;
    while ((rm = rateRe.exec(block)) !== null) {
      results.push({ date, currency: rm[1]!, rate: parseFloat(rm[2]!) });
    }
  }

  return results;
}

export async function fetchDailyRates(): Promise<EcbRate[]> {
  const res = await fetch(DAILY_URL, { cache: "no-store" });
  if (!res.ok) throw new Error(`ECB daily fetch failed: ${res.status}`);
  return parseXml(await res.text());
}

export async function fetchHistoricalRates(since: string): Promise<EcbRate[]> {
  const res = await fetch(HIST_URL, { cache: "no-store" });
  if (!res.ok) throw new Error(`ECB historical fetch failed: ${res.status}`);
  return parseXml(await res.text(), since);
}
