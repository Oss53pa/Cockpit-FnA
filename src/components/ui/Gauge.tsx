export function Gauge({ value, max = 100, label }: { value: number; max?: number; label: string }) {
  const pct = Math.min(Math.max((value / max) * 100, 0), 100);
  const color = pct > 80 ? '#171717' : pct > 50 ? '#525252' : '#a3a3a3';
  const angle = -90 + (pct / 100) * 180;

  return (
    <div className="text-center">
      <div className="relative w-[110px] h-14 mx-auto overflow-hidden">
        <div
          className="absolute w-[110px] h-[110px] rounded-full box-border"
          style={{
            border: '10px solid #e5e5e5', borderBottom: 'none', borderLeft: 'none',
            transform: 'rotate(-90deg)',
          }}
        />
        <div
          className="absolute w-[110px] h-[110px] rounded-full box-border transition-transform"
          style={{
            border: `10px solid ${color}`, borderBottom: 'none', borderLeft: 'none',
            transform: `rotate(${angle}deg)`,
          }}
        />
        <div className="absolute bottom-0 w-full text-center num text-xl font-bold" style={{ color }}>
          {Math.round(pct)}%
        </div>
      </div>
      <p className="text-[11px] text-primary-500 mt-2 font-medium">{label}</p>
    </div>
  );
}
