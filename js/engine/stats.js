// SD (single-variable) and REG (linear regression y = A + Bx) statistics.
// data: SD → [{x, f}], REG → [{x, y, f}]. Values are plain numbers.

export class StatError extends Error {}

function sums(data) {
  let n = 0, sx = 0, sy = 0, sx2 = 0, sy2 = 0, sxy = 0;
  for (const { x, y = 0, f } of data) {
    n += f;
    sx += f * x;
    sy += f * y;
    sx2 += f * x * x;
    sy2 += f * y * y;
    sxy += f * x * y;
  }
  return { n, sx, sy, sx2, sy2, sxy };
}

function moments(data) {
  const s = sums(data);
  if (s.n <= 0) throw new StatError();
  const mx = s.sx / s.n;
  const my = s.sy / s.n;
  let Sxx = 0, Syy = 0, Sxy = 0;
  for (const { x, y = 0, f } of data) {
    Sxx += f * (x - mx) * (x - mx);
    Syy += f * (y - my) * (y - my);
    Sxy += f * (x - mx) * (y - my);
  }
  return { ...s, mx, my, Sxx, Syy, Sxy };
}

function line(data) {
  const m = moments(data);
  if (m.Sxx === 0) throw new StatError();
  const B = m.Sxy / m.Sxx;
  const A = m.my - B * m.mx;
  return { ...m, A, B };
}

export function statValue(name, data) {
  switch (name) {
    case 'sn': return sums(data).n;
    case 'sx': return sums(data).sx;
    case 'sx2': return sums(data).sx2;
    case 'sy': return sums(data).sy;
    case 'sy2': return sums(data).sy2;
    case 'sxy': return sums(data).sxy;
    case 'mx': return moments(data).mx;
    case 'my': return moments(data).my;
    case 'sxn': { const m = moments(data); return Math.sqrt(m.Sxx / m.n); }
    case 'syn': { const m = moments(data); return Math.sqrt(m.Syy / m.n); }
    case 'sxn1': {
      const m = moments(data);
      if (m.n <= 1) throw new StatError();
      return Math.sqrt(m.Sxx / (m.n - 1));
    }
    case 'syn1': {
      const m = moments(data);
      if (m.n <= 1) throw new StatError();
      return Math.sqrt(m.Syy / (m.n - 1));
    }
    case 'ra': return line(data).A;
    case 'rb': return line(data).B;
    case 'rr': {
      const m = moments(data);
      const d = Math.sqrt(m.Sxx * m.Syy);
      if (d === 0) throw new StatError();
      return m.Sxy / d;
    }
    default: throw new StatError();
  }
}

/** x̂ (estimate x for a given y) or ŷ (estimate y for a given x). */
export function regEstimate(kind, v, data) {
  const { A, B } = line(data);
  if (kind === 'yhat') return A + B * v;
  if (B === 0) throw new StatError();
  return (v - A) / B;
}
