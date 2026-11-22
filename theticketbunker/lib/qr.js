import qrcode from 'qrcode-generator';
// QR as rows of dark runs, drawn with plain Views (no SVG dependency).
export function qrRuns(text) {
  const qr = qrcode(0, 'M'); qr.addData(text); qr.make();
  const n = qr.getModuleCount(), rows = [];
  for (let r = 0; r < n; r++) {
    const runs = [];
    for (let c = 0; c < n; c++) {
      if (!qr.isDark(r, c)) continue;
      const start = c; while (c + 1 < n && qr.isDark(r, c + 1)) c++;
      runs.push([start, c - start + 1]);
    }
    rows.push(runs);
  }
  return {size: n, rows};
}
