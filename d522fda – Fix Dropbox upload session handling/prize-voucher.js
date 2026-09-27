// Request the actual two-page artwork PDF after administrator authentication.
(function () {
  async function fetchPdf(id, token) {
    const response = await fetch(`/api/admin-prize-voucher?id=${encodeURIComponent(id)}`, {
      headers: { authorization: `Bearer ${token}` }, cache: 'no-store'
    });
    if (!response.ok) {
      const problem = await response.json().catch(() => ({}));
      throw new Error(problem.error || 'Could not download prize voucher');
    }
    return URL.createObjectURL(await response.blob());
  }
  async function download(prize, token) {
    const url = await fetchPdf(prize.id, token);
    const link = document.createElement('a');
    link.href = url; link.download = `SoundBunker-${prize.code}.pdf`;
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
  async function print(prize, token) {
    const page = window.open('', '_blank');
    if (!page) throw new Error('Allow pop-ups to open the voucher PDF');
    try { page.location.href = await fetchPdf(prize.id, token); }
    catch (error) { page.close(); throw error; }
  }
  window.PrizeVoucher = { download, print };
})();
