// 無圧縮(STORE)の最小 ZIP ライター。連番 PNG の一括ダウンロードに使う。
// PNG は既に圧縮済みなので STORE で十分。ZIP64 非対応(4GB/65535件まで)。

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

/**
 * entries: [{ name: string, data: Uint8Array, crc?: number }]
 * 同じ data を複数エントリで使い回してよい(crc を渡せば再計算しない)
 */
export function buildZip(entries) {
  const encoder = new TextEncoder();
  const parts = [];
  const central = [];
  let offset = 0;

  for (const e of entries) {
    const nameBytes = encoder.encode(e.name);
    const data = e.data;
    const crc = e.crc != null ? e.crc : crc32(data);

    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true);  // local file header
    lh.setUint16(4, 20, true);          // version needed
    lh.setUint16(6, 0x0800, true);      // UTF-8 filename flag
    lh.setUint16(8, 0, true);           // method: store
    lh.setUint16(10, 0, true);          // time
    lh.setUint16(12, 0x5661, true);     // date (固定値)
    lh.setUint32(14, crc, true);
    lh.setUint32(18, data.length, true);
    lh.setUint32(22, data.length, true);
    lh.setUint16(26, nameBytes.length, true);
    lh.setUint16(28, 0, true);          // extra len
    parts.push(new Uint8Array(lh.buffer), nameBytes, data);

    central.push({ nameBytes, crc, size: data.length, offset });
    offset += 30 + nameBytes.length + data.length;
  }

  const cdParts = [];
  let cdSize = 0;
  for (const c of central) {
    const cd = new DataView(new ArrayBuffer(46));
    cd.setUint32(0, 0x02014b50, true);  // central directory header
    cd.setUint16(4, 20, true);
    cd.setUint16(6, 20, true);
    cd.setUint16(8, 0x0800, true);
    cd.setUint16(10, 0, true);
    cd.setUint16(12, 0, true);
    cd.setUint16(14, 0x5661, true);
    cd.setUint32(16, c.crc, true);
    cd.setUint32(20, c.size, true);
    cd.setUint32(24, c.size, true);
    cd.setUint16(28, c.nameBytes.length, true);
    cd.setUint32(42, c.offset, true);
    cdParts.push(new Uint8Array(cd.buffer), c.nameBytes);
    cdSize += 46 + c.nameBytes.length;
  }

  const eocd = new DataView(new ArrayBuffer(22));
  eocd.setUint32(0, 0x06054b50, true);
  eocd.setUint16(8, central.length, true);
  eocd.setUint16(10, central.length, true);
  eocd.setUint32(12, cdSize, true);
  eocd.setUint32(16, offset, true);
  return new Blob([...parts, ...cdParts, new Uint8Array(eocd.buffer)], { type: 'application/zip' });
}
