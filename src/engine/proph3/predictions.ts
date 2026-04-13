// Prévisions Proph3 — Prophet-like (trend + saisonnalité + jours fériés OHADA)
import { db } from '../../db/schema';

export interface TimePoint { date: string; value: number; }
export interface ForecastResult { predictions: TimePoint[]; confidence80: { lower: number[]; upper: number[] }; confidence95: { lower: number[]; upper: number[] }; mape: number; alerteRupture: boolean; dateRupture?: string; }
export interface TresoForecast { soldeActuel: number; fluxMoyenMensuel: number; horizon: number; soldePrevu: number; risqueRupture: boolean; forecast: ForecastResult; }

const FERIES = [{ m: 1, d: 1 }, { m: 5, d: 1 }, { m: 12, d: 25 }, { m: 8, d: 7 }, { m: 4, d: 4 }];
const isHoliday = (dt: Date) => FERIES.some((h) => h.m === dt.getMonth() + 1 && h.d === dt.getDate());

export class ProphetForecaster {
  private slope = 0; private intercept = 0; private weekly = new Array(7).fill(0); private monthly = new Array(12).fill(0); private holiday = 0; private std = 0;

  fit(data: TimePoint[]) {
    if (data.length < 7) { this.intercept = data.length > 0 ? data[data.length - 1].value : 0; return; }
    const n = data.length, vals = data.map((d) => d.value), dates = data.map((d) => new Date(d.date));
    const mx = (n - 1) / 2, my = vals.reduce((a, v) => a + v, 0) / n;
    let num = 0, den = 0; for (let i = 0; i < n; i++) { num += (i - mx) * (vals[i] - my); den += (i - mx) ** 2; }
    this.slope = den ? num / den : 0; this.intercept = my - this.slope * mx;
    const dt = vals.map((v, i) => v - (this.intercept + this.slope * i));
    const wb: number[][] = Array.from({ length: 7 }, () => []); dates.forEach((d, i) => wb[d.getDay()].push(dt[i]));
    this.weekly = wb.map((b) => b.length ? b.reduce((a, v) => a + v, 0) / b.length : 0);
    const mb: number[][] = Array.from({ length: 12 }, () => []); dates.forEach((d, i) => mb[d.getMonth()].push(dt[i]));
    this.monthly = mb.map((b) => b.length ? b.reduce((a, v) => a + v, 0) / b.length : 0);
    const hv: number[] = [], nv: number[] = []; dates.forEach((d, i) => (isHoliday(d) ? hv : nv).push(dt[i]));
    this.holiday = hv.length ? (hv.reduce((a, v) => a + v, 0) / hv.length) - (nv.length ? nv.reduce((a, v) => a + v, 0) / nv.length : 0) : 0;
    const res = vals.map((v, i) => v - (this.intercept + this.slope * i + this.weekly[dates[i].getDay()] + this.monthly[dates[i].getMonth()] + (isHoliday(dates[i]) ? this.holiday : 0)));
    const mr = res.reduce((a, r) => a + r, 0) / n;
    this.std = Math.sqrt(res.reduce((a, r) => a + (r - mr) ** 2, 0) / n);
  }

  forecast(horizon: 30 | 60 | 90, startDate?: string): ForecastResult {
    const preds: TimePoint[] = [], l80: number[] = [], u80: number[] = [], l95: number[] = [], u95: number[] = [];
    const start = startDate ? new Date(startDate) : new Date();
    let alerte = false, dateR: string | undefined;
    for (let i = 1; i <= horizon; i++) {
      const d = new Date(start); d.setDate(d.getDate() + i);
      const t = this.intercept + this.slope * (i + 365), s = this.weekly[d.getDay()] + this.monthly[d.getMonth()], h = isHoliday(d) ? this.holiday : 0;
      const p = t + s + h, u = this.std * Math.sqrt(i / 7);
      preds.push({ date: d.toISOString().split('T')[0], value: Math.round(p) });
      l80.push(Math.round(p - 1.28 * u)); u80.push(Math.round(p + 1.28 * u));
      l95.push(Math.round(p - 1.96 * u)); u95.push(Math.round(p + 1.96 * u));
      if (p < 0 && !alerte) { alerte = true; dateR = d.toISOString().split('T')[0]; }
    }
    const mape = this.std > 0 && this.intercept ? Math.min(Math.round((this.std / Math.abs(this.intercept)) * 10000) / 100, 100) : 0;
    return { predictions: preds, confidence80: { lower: l80, upper: u80 }, confidence95: { lower: l95, upper: u95 }, mape, alerteRupture: alerte, dateRupture: dateR };
  }
}

export async function forecastTresorerie(orgId: string, year: number, horizon: 30 | 60 | 90 = 30): Promise<TresoForecast> {
  const periods = await db.periods.where('orgId').equals(orgId).toArray();
  const entries = await db.gl.where('orgId').equals(orgId).toArray();
  const md: TimePoint[] = []; let solde = 0;
  for (const p of periods.filter((p) => p.year === year && p.month >= 1).sort((a, b) => a.month - b.month)) {
    let flux = 0;
    for (const e of entries) { if (e.periodId !== p.id || !e.account.startsWith('5')) continue; flux += e.account.startsWith('56') ? -(e.credit - e.debit) : (e.debit - e.credit); }
    md.push({ date: `${year}-${String(p.month).padStart(2, '0')}-15`, value: flux }); solde += flux;
  }
  const avg = md.length ? md.reduce((s, d) => s + d.value, 0) / md.length : 0;
  const f = new ProphetForecaster(); f.fit(md); const forecast = f.forecast(horizon);
  const prev = Math.round(solde + (avg / 30) * horizon);
  return { soldeActuel: Math.round(solde), fluxMoyenMensuel: Math.round(avg), horizon, soldePrevu: prev, risqueRupture: prev < 0 || forecast.alerteRupture, forecast };
}
