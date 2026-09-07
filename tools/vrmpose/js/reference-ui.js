// Pixel resolution determines aspect; the measured span determines real-world scale.
export function imageHeightDialog(bitmap) {
  return new Promise(resolve => {
    const dialog = document.createElement('dialog');
    dialog.className = 'reference-dialog';
    dialog.innerHTML = '<form method="dialog"><h3>画像のサイズ合わせ</h3><p>全体の高さを入力、または画像上の2点をタップして、その間の実寸を指定してください。</p><canvas aria-label="寸法を合わせる2点を選択"></canvas><p class="measure-state" role="status"></p><label><span class="measure-label">画像全体の高さ</span> <input type="number" min="0.001" max="1000" step="any" value="1.6" required> m</label><div><button type="button" class="reset-points">2点を解除</button><button value="cancel" formnovalidate>キャンセル</button><button value="apply">配置</button></div></form>';
    document.body.append(dialog);
    const canvas = dialog.querySelector('canvas');
    const ctx = canvas.getContext('2d');
    const ratio = Math.min(1, 800 / Math.max(bitmap.width, bitmap.height));
    canvas.width = Math.max(1, Math.round(bitmap.width * ratio));
    canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
    let points = [];
    function draw() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = '#ffb62e'; ctx.fillStyle = '#ffb62e'; ctx.lineWidth = 3;
      if (points.length === 2) {
        ctx.beginPath(); ctx.moveTo(...points[0]); ctx.lineTo(...points[1]); ctx.stroke();
      }
      for (const [x,y] of points) { ctx.beginPath(); ctx.arc(x,y,6,0,Math.PI*2); ctx.fill(); }
      dialog.querySelector('.measure-label').textContent = points.length === 2 ? '指定した2点間の長さ' : '画像全体の高さ';
      dialog.querySelector('.measure-state').textContent = bitmap.width + ' × ' + bitmap.height + 'px — ' + points.length + '/2点選択';
    }
    canvas.addEventListener('pointerdown', e => {
      const r = canvas.getBoundingClientRect();
      if (points.length === 2) points = [];
      points.push([(e.clientX-r.left)*canvas.width/r.width, (e.clientY-r.top)*canvas.height/r.height]); draw();
    });
    dialog.querySelector('.reset-points').onclick = () => { points = []; draw(); };
    let result = null;
    dialog.querySelector('form').addEventListener('submit', e => {
      if (e.submitter?.value !== 'apply') return;
      const meters = Number(dialog.querySelector('input').value);
      const pixels = points.length === 2 ? Math.hypot(points[1][0]-points[0][0], points[1][1]-points[0][1]) : canvas.height;
      if (points.length === 1 || pixels < 2 || !(meters > 0)) {
        e.preventDefault();
        dialog.querySelector('.measure-state').textContent = '2点を指定するか「2点を解除」を押してください。';
        return;
      }
      result = meters * canvas.height / pixels;
    });
    dialog.addEventListener('close', () => { dialog.remove(); resolve(result); }, { once:true });
    draw(); dialog.showModal();
  });
}
