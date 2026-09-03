/**
 * Kucuk TrueType/OpenType okuyucu.
 *
 * Neden kendi okuyucumuz: alt kumelemenin gercekten ise yaradigini
 * dogrulamak icin fontun HANGI kod noktalarini kapsadigini bilmemiz gerekiyor.
 * "Alt kumeledim, herhalde olmustur" kabul edilemez — Uthmani metindeki
 * U+06E3, U+06E8, U+06EA gibi isaretler tum Kur'an'da bir kez geciyor; bir
 * tanesi dusse hicbir test bunu yakalamaz, ayet yanlis gorunur.
 *
 * Yalnizca ihtiyacimiz olan tablolar okunur: cmap (kapsama), head (birim),
 * maxp (glif sayisi), name (aile adi ve surum). Bicimlendirme yapilmaz,
 * font yazilmaz.
 *
 * Kaynak: OpenType spec — cmap format 4 ve format 12 kullanilir; modern
 * fontlarin tamami bu ikisinden en az birini tasir.
 */

export interface FontInfo {
  /** cmap'te karsiligi olan (glif id != 0) kod noktalari */
  codepoints: Set<number>;
  /** maxp.numGlyphs — alt kumelemenin etkisini gostermek icin */
  glyphCount: number;
  unitsPerEm: number;
  /** name tablosu id 1 */
  family: string | null;
  /** name tablosu id 5 */
  version: string | null;
}

interface TableRecord {
  offset: number;
  length: number;
}

function readTableDirectory(buffer: Buffer): Map<string, TableRecord> {
  const tag = buffer.readUInt32BE(0);
  // 'ttcf' — font koleksiyonu. Kullandigimiz kaynaklarda yok; desteklenmiyor.
  if (tag === 0x74746366) {
    throw new Error("TrueType koleksiyonu (.ttc) desteklenmiyor");
  }
  const numTables = buffer.readUInt16BE(4);
  const tables = new Map<string, TableRecord>();
  for (let i = 0; i < numTables; i += 1) {
    const base = 12 + i * 16;
    const name = buffer.toString("latin1", base, base + 4);
    tables.set(name, {
      offset: buffer.readUInt32BE(base + 8),
      length: buffer.readUInt32BE(base + 12),
    });
  }
  return tables;
}

/**
 * En iyi cmap alt tablosunu secer.
 *
 * Tercih sirasi, BMP disini de kapsayanlar once:
 *   (3,10) Windows UCS-4 -> format 12
 *   (0,4) / (0,6) Unicode full
 *   (3,1)  Windows BMP    -> format 4
 *   (0,3)  Unicode BMP
 */
function selectCmapSubtable(buffer: Buffer, cmapOffset: number): number {
  const numSubtables = buffer.readUInt16BE(cmapOffset + 2);
  const ranked: { rank: number; offset: number }[] = [];

  for (let i = 0; i < numSubtables; i += 1) {
    const base = cmapOffset + 4 + i * 8;
    const platformId = buffer.readUInt16BE(base);
    const encodingId = buffer.readUInt16BE(base + 2);
    const offset = cmapOffset + buffer.readUInt32BE(base + 4);

    let rank = -1;
    if (platformId === 3 && encodingId === 10) rank = 4;
    else if (platformId === 0 && (encodingId === 4 || encodingId === 6)) rank = 3;
    else if (platformId === 3 && encodingId === 1) rank = 2;
    else if (platformId === 0) rank = 1;

    if (rank > 0) ranked.push({ rank, offset });
  }

  const best = ranked.sort((a, b) => b.rank - a.rank)[0];
  if (best === undefined) {
    throw new Error("cmap icinde kullanilabilir alt tablo yok");
  }
  return best.offset;
}

function readCmapFormat4(buffer: Buffer, offset: number, out: Set<number>): void {
  const segCount = buffer.readUInt16BE(offset + 6) / 2;
  const endCodes = offset + 14;
  const startCodes = endCodes + segCount * 2 + 2;
  const idDeltas = startCodes + segCount * 2;
  const idRangeOffsets = idDeltas + segCount * 2;

  for (let seg = 0; seg < segCount; seg += 1) {
    const end = buffer.readUInt16BE(endCodes + seg * 2);
    const start = buffer.readUInt16BE(startCodes + seg * 2);
    // 0xFFFF sonlandirici segment; gercek bir karakter degil.
    if (start === 0xffff) continue;

    const idDelta = buffer.readInt16BE(idDeltas + seg * 2);
    const idRangeOffset = buffer.readUInt16BE(idRangeOffsets + seg * 2);

    for (let code = start; code <= end && code !== 0x10000; code += 1) {
      let glyphId: number;
      if (idRangeOffset === 0) {
        glyphId = (code + idDelta) & 0xffff;
      } else {
        const glyphIndexAddress =
          idRangeOffsets + seg * 2 + idRangeOffset + (code - start) * 2;
        if (glyphIndexAddress + 1 >= buffer.length) continue;
        const raw = buffer.readUInt16BE(glyphIndexAddress);
        glyphId = raw === 0 ? 0 : (raw + idDelta) & 0xffff;
      }
      // Glif 0 = .notdef: cmap'te yer alsa bile kapsanmiyor demektir.
      if (glyphId !== 0) out.add(code);
    }
  }
}

function readCmapFormat12(buffer: Buffer, offset: number, out: Set<number>): void {
  const groupCount = buffer.readUInt32BE(offset + 12);
  for (let i = 0; i < groupCount; i += 1) {
    const base = offset + 16 + i * 12;
    const start = buffer.readUInt32BE(base);
    const end = buffer.readUInt32BE(base + 4);
    const startGlyph = buffer.readUInt32BE(base + 8);
    for (let code = start; code <= end; code += 1) {
      if (startGlyph + (code - start) !== 0) out.add(code);
    }
  }
}

/** name tablosundan bir kaydi okur (Windows/Unicode, UTF-16BE tercihli). */
function readNameRecord(buffer: Buffer, table: TableRecord, nameId: number): string | null {
  const { offset } = table;
  const count = buffer.readUInt16BE(offset + 2);
  const stringOffset = offset + buffer.readUInt16BE(offset + 4);

  let fallback: string | null = null;
  for (let i = 0; i < count; i += 1) {
    const base = offset + 6 + i * 12;
    if (buffer.readUInt16BE(base + 6) !== nameId) continue;

    const platformId = buffer.readUInt16BE(base);
    const length = buffer.readUInt16BE(base + 8);
    const start = stringOffset + buffer.readUInt16BE(base + 10);
    const slice = buffer.subarray(start, start + length);
    // platform 3 (Windows) ve 0 (Unicode) UTF-16BE; 1 (Macintosh) tek bayt.
    const value =
      platformId === 1 ? slice.toString("latin1") : slice.swap16().toString("utf16le");

    if (platformId === 3) return value;
    fallback ??= value;
  }
  return fallback;
}

export function readFontInfo(buffer: Buffer): FontInfo {
  const tables = readTableDirectory(buffer);

  const cmap = tables.get("cmap");
  if (cmap === undefined) throw new Error("cmap tablosu yok");
  const subtableOffset = selectCmapSubtable(buffer, cmap.offset);
  const format = buffer.readUInt16BE(subtableOffset);

  const codepoints = new Set<number>();
  if (format === 4) readCmapFormat4(buffer, subtableOffset, codepoints);
  else if (format === 12) readCmapFormat12(buffer, subtableOffset, codepoints);
  else throw new Error(`cmap format ${format} desteklenmiyor (4 veya 12 bekleniyordu)`);

  const head = tables.get("head");
  const maxp = tables.get("maxp");
  const name = tables.get("name");

  return {
    codepoints,
    glyphCount: maxp === undefined ? 0 : buffer.readUInt16BE(maxp.offset + 4),
    unitsPerEm: head === undefined ? 0 : buffer.readUInt16BE(head.offset + 18),
    family: name === undefined ? null : readNameRecord(buffer, name, 1),
    version: name === undefined ? null : readNameRecord(buffer, name, 5),
  };
}
