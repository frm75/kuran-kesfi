import { computeVerseId } from "@kuran/schema";
import {
  Report,
  closePool,
  fail,
  fetchCached,
  info,
  upsertMany,
  withTransaction,
} from "@kuran/pipeline";
import {
  EXPECTED_VERSE_COUNT,
  parseTanzilText,
  tanzilCacheName,
  tanzilTextUrl,
} from "./lib/tanzil_text.js";

/**
 * Ceviriyazi (transkripsiyon) import — YALNIZCA `verse.transcription_tr`.
 *
 * Neden ayri bir script:
 *   Acik Kuran ceviriyazi vermiyor; 6236 ayetin hicbirinde yoktu. Kaynak
 *   Tanzil'in `tr.transliteration` dosyasinda var ve `tanzil_translations.ts`
 *   onu zaten okuyor — ama o script ayni zamanda 9 Turkce meal yaziyor ve
 *   yazar slug'lari Acik Kuran'inkilerle cakisiyor. Bu yuzden ceviriyazi
 *   tek basina buraya ayrildi; author ve translation tablolarina DOKUNMAZ.
 *
 * Plan §2.5: "Ceviriyazi Arapca bilmeyen okuyucu icin her zaman erisilebilir
 * olmalidir." Bu script o sartin karsiligidir.
 *
 * TELIF (tanzil.net/trans/ Terms of Use):
 *   - Ticari olmayan kullanim; proje ticari degildir (plan §1.1).
 *   - Ceviriyazinin sahibi Tanzil degil, hazirlayanidir. Dosyanin kendi ust
 *     bilgisindeki isim (Muhammet Abay) atifta gosterilir; asagida dosyadan
 *     OKUNUR, sabit yazilmaz — kaynak degisirse atif da degisir.
 *   - "Ucten fazla ceviri" sarti burada devreye girmiyor: tek dosya ve bu bir
 *     meal degil, okunusun Latin harfle yazimi. Yine de geri baglanti
 *     veriliyor (build.ts atif listesine ekliyor).
 *
 * Idempotenttir; tekrar calistirmak ayni sonucu verir.
 *
 * Calistirma:  pnpm --filter @kuran/import transcription
 */

const TANZIL_ID = "tr.transliteration";
const TERMS_URL = "https://tanzil.net/trans/";

async function main(): Promise<void> {
  const report = new Report("transcription");

  const body = await fetchCached(tanzilTextUrl(TANZIL_ID), {
    cacheName: tanzilCacheName(TANZIL_ID),
  });
  const parsed = parseTanzilText(body, TANZIL_ID);

  // Atif bilgisi dosyanin kendisinden okunur.
  const preparedBy = parsed.meta["Translator"] ?? parsed.meta["Name"] ?? "bilinmiyor";
  const lastUpdate = parsed.meta["Last Update"] ?? "bilinmiyor";
  info(`${TANZIL_ID}: ${parsed.texts.size} ayet · hazirlayan "${preparedBy}" · guncelleme ${lastUpdate}`);
  report.note(`Kaynak: ${tanzilTextUrl(TANZIL_ID)}`);
  report.note(`Hazirlayan: ${preparedBy} · son guncelleme: ${lastUpdate}`);

  const rows: unknown[][] = [];
  let blank = 0;
  for (const [key, rawText] of parsed.texts) {
    const [surahPart, versePart] = key.split(":");
    // Kaynakta gorunmez bosluk gelebiliyor (bkz. docs/BACKLOG.md veri kalitesi).
    // JS .trim() U+00A0 dahil siler; SQL btrim() silmez.
    const text = rawText.trim();
    if (text === "") {
      blank += 1;
      report.issue(`${key}: kaynakta bos ceviriyazi, atlandi`);
      continue;
    }
    rows.push([computeVerseId(Number(surahPart), Number(versePart)), text]);
  }
  if (blank > 0) info(`${blank} ayette bos ceviriyazi atlandi`);

  await withTransaction(async (client) => {
    // Kaynak kaydi: ceviriyazi Tanzil'in kendi metni degil, hazirlayanina ait.
    // Ayri bir slug altinda tutuluyor ki arayuzde "Tanzil Arapca metni" ile
    // karismasin ve <SourceBadge> dogru adi gostersin (plan 12.10).
    await upsertMany(
      client,
      "source",
      ["slug", "name", "work_title", "author", "reference", "url", "license", "note"],
      [
        [
          "tanzil-transliteration",
          "Tanzil çeviriyazı",
          "Kur'an-ı Kerim Latin harfli okunuş",
          preparedBy,
          `${TANZIL_ID} · son güncelleme ${lastUpdate}`,
          TERMS_URL,
          "Tanzil — yalnızca ticari olmayan kullanım; telif hazırlayana aittir",
          "Açık Kuran çeviriyazı vermiyor; okunuş metni bu kaynaktan alındı.",
        ],
      ],
      ["slug"],
    );

    // Gecici tablo uzerinden toplu guncelleme — 6236 tek tek UPDATE'ten hizli.
    // upsertMany ON CONFLICT kullandigi icin verse_id birincil anahtar olmali.
    await client.query(
      `CREATE TEMP TABLE tmp_transcription (
         verse_id integer PRIMARY KEY,
         text     text NOT NULL
       ) ON COMMIT DROP`,
    );
    await upsertMany(client, "tmp_transcription", ["verse_id", "text"], rows, ["verse_id"]);

    // Bilinmeyen ayet id'si sessizce yutulmasin: ceviriyazi dosyasi 6236 satir
    // ama numaralandirma farkliysa UPDATE bir sey bulamaz ve fark edilmez.
    const { rows: orphanRows } = await client.query<{ n: string }>(
      `SELECT count(*) AS n FROM tmp_transcription t
        WHERE NOT EXISTS (SELECT 1 FROM verse v WHERE v.id = t.verse_id)`,
    );
    const orphans = Number(orphanRows[0]?.n ?? 0);
    if (orphans > 0) {
      fail(`${orphans} ceviriyazi satiri hicbir ayete karsilik gelmiyor — numaralandirma uyusmuyor`);
    }

    const updated = await client.query(
      `UPDATE verse v SET transcription_tr = t.text
         FROM tmp_transcription t
        WHERE t.verse_id = v.id
          AND (v.transcription_tr IS DISTINCT FROM t.text)`,
    );
    info(
      `verse.transcription_tr: ${(updated.rowCount ?? 0).toLocaleString("tr-TR")} satir guncellendi`,
    );
    report.note(`Guncellenen satir: ${updated.rowCount ?? 0}`);
  });

  const { rows: checkRows } = await withTransaction((client) =>
    client.query<{ total: string; filled: string; empty_text: string }>(
      `SELECT count(*)                                                       AS total,
              count(*) FILTER (WHERE transcription_tr IS NOT NULL)           AS filled,
              count(*) FILTER (WHERE transcription_tr = '')                  AS empty_text
         FROM verse`,
    ),
  );
  const summary = checkRows[0];
  if (summary === undefined) fail("dogrulama sorgusu bos dondu");

  info(`veritabani: ${summary.filled}/${summary.total} ayette ceviriyazi`);
  if (Number(summary.total) !== EXPECTED_VERSE_COUNT) {
    fail(`${EXPECTED_VERSE_COUNT} ayet bekleniyordu, ${summary.total} bulundu`);
  }
  if (Number(summary.filled) !== rows.length) {
    fail(`${rows.length} ayette ceviriyazi bekleniyordu, ${summary.filled} bulundu`);
  }
  if (summary.empty_text !== "0") {
    fail(`${summary.empty_text} ayette bos ceviriyazi var`);
  }

  report.note(`Ceviriyazili ayet: ${summary.filled}/${summary.total}`);
  report.note(`ZORUNLU: arayuzde ${TERMS_URL} geri baglantisi ve hazirlayan adi gosterilir.`);
  info(`rapor: ${report.write()}`);
}

main()
  .then(() => closePool())
  .catch(async (error: unknown) => {
    await closePool();
    fail(error instanceof Error ? `${error.message}\n${error.stack ?? ""}` : String(error));
  });
