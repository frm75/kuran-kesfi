/**
 * B. Uretilen statik JSON — Yazmalar, takvim, kiraat, tefsir ve medya.
 *
 * Her fonksiyon tek bir dosya turunu dogrular; hangi yolun hangisine gittigi
 * `../static_output.ts` icindeki tabloda.
 */

import {
  staticManuscripts,
  staticMedia,
  staticVerseMedia,
  staticVerseManuscripts,
  schedule,
  staticRecitation,
  staticTafsirIndex,
  staticTafsirSurah,
} from "@kuran/schema";
import { checkScheduleAdjacentRepeats } from "../../lib/schedule.js";
import { errors, tick } from "../report.js";
import type { StaticFile, StaticState } from "./state.js";

export function checkManuscripts({ relativePath, parsed }: StaticFile): void {
  const result = staticManuscripts.safeParse(parsed);
  tick();
  if (!result.success) errors.push(`${relativePath}: ${result.error.message}`);
  else {
    /*
     * Yazma verisi CC BY-SA 4.0 ve GORUNTU TASIMAZ: kaynaktaki kayitlarin
     * hepsinde goruntu izni "restricted". Buraya bir goruntu adresi
     * sizarsa lisans ihlali olur — build durur.
     */
    for (const m of result.data.manuscripts) {
      if (!m.url.startsWith("https://corpuscoranicum.de/")) {
        errors.push(`${relativePath}: ${String(m.id)} kaynak disi adres: ${m.url}`);
        break;
      }
      const bad = m.ranges.find(([start, end]) => end < start);
      if (bad !== undefined) {
        errors.push(`${relativePath}: ${String(m.id)} ters aralik ${bad[0]}-${bad[1]}`);
        break;
      }
    }
  }
}

export function checkVerseManuscripts({ relativePath, parsed }: StaticFile): void {
  const result = staticVerseManuscripts.safeParse(parsed);
  tick();
  if (!result.success) errors.push(`${relativePath}: ${result.error.message}`);
  else {
    for (const [key, entry] of Object.entries(result.data.verses)) {
      if (entry.oldest.length > entry.count) {
        errors.push(
          `${relativePath}: ${key} icin gosterilen yazma sayisi toplamdan buyuk`,
        );
        break;
      }
    }
  }
}

export function checkSchedule({ relativePath, parsed }: StaticFile): void {
  const result = schedule.safeParse(parsed);
  tick();
  if (!result.success) errors.push(`${relativePath}: ${result.error.message}`);
  else {
    /*
     * Takvim botun TEK icerik kaynagi (plan 19.6). Buradaki bir bosluk
     * abonelere sessizce bos ya da tekrarli mesaj gonderilmesi demek.
     */
    const entries = result.data.entries;
    if (entries.length !== 366) {
      errors.push(`${relativePath}: ${String(entries.length)} gun var, 366 olmali`);
    } else {
      for (const [index, entry] of entries.entries()) {
        if (entry.dayIndex !== index) {
          errors.push(`${relativePath}: gun indeksi atlamis (${String(index)})`);
          break;
        }
        if (entry.verseId !== entry.surahId * 1000 + entry.verseNumber) {
          errors.push(
            `${relativePath}: gun ${String(index)} verseId sure/ayet ile tutmuyor`,
          );
          break;
        }
      }
      /*
       * Ilkeler DONUSUMLU olmali: bir tur icinde ayni ilke iki kez
       * gelirse baska bir ilke o yil hic gelmiyor demektir.
       */
      const principles = new Set(entries.map((e) => e.principleSlug));
      const cycle = entries.slice(0, principles.size).map((e) => e.principleSlug);
      if (new Set(cycle).size !== principles.size) {
        errors.push(
          `${relativePath}: ilk ${String(principles.size)} gunde ilke tekrari var — ` +
            "rotasyon bozuk",
        );
      }
      /*
       * Ilke donusumlu olsa bile AYNI AYET iki ilkenin dayanagi olabilir ve
       * yan yana dusen iki gun ayni ayeti gosterebilir (2026-09-16: gun 7/8
       * 'ofkeyi-yutma' ve 'affetme', ikisi de 3:134). Ustteki ilke denetimi
       * bunu gormez; abone ust uste iki gun ayni ayeti alir.
       */
      errors.push(...checkScheduleAdjacentRepeats(entries));
    }
  }
}

export function checkRecitation({ relativePath, parsed }: StaticFile): void {
  const result = staticRecitation.safeParse(parsed);
  tick();
  if (!result.success) errors.push(`${relativePath}: ${result.error.message}`);
  else {
    for (const r of result.data.reciters) {
      /*
       * Kapsam hesabi kendi icinde tutarli olmali: elde duran + eksik = 6236.
       * Tutmuyorsa manifest indirmeden SONRA yeniden yazilmamis demektir ve
       * arayuz olmayan bir dosyaya oynatici basar (sessiz kirilma).
       */
      if (r.verseCount + r.missingVerses.length !== 6236) {
        errors.push(
          `${relativePath}: ${r.slug} kapsami tutmuyor — ` +
            `${String(r.verseCount)} elde + ${String(r.missingVerses.length)} eksik ` +
            "= 6236 olmali (manifest indirmeden sonra yeniden yazilmali)",
        );
        break;
      }
      if (r.verseCount > 0 && r.totalBytes === 0) {
        errors.push(`${relativePath}: ${r.slug} dosyalari var ama toplam boyut sifir`);
        break;
      }
    }
  }
}

export function checkTafsirIndex({ relativePath, parsed }: StaticFile, s: StaticState): void {
  const result = staticTafsirIndex.safeParse(parsed);
  tick();
  if (!result.success) errors.push(`${relativePath}: ${result.error.message}`);
  else {
    const seen = new Set<string>();
    for (const t of result.data.tafsirs) {
      if (seen.has(t.slug)) {
        errors.push(`${relativePath}: '${t.slug}' iki kez gecmis`);
        break;
      }
      seen.add(t.slug);

      /*
       * QURANENC KOSUL 3 — SURUM NUMARASI.
       *
       * Kaynagin yeniden yayin izni yedi kosula bagli; ucuncusu surumun
       * belirtilmesini istiyor. Numara `licenseNote` icinde durur
       * ("QuranEnc.com · surum 1.0.0 · ...") ve ayet sayfasinda o not
       * oldugu gibi basilir. Not kaybolursa izin kosulu duser — bu yuzden
       * uyari degil HATA: surumsuz yayina cikilmaz.
       */
      if (t.sourceSlug === "quranenc" && !/s[uü]r[uü]m\s+\d/i.test(t.licenseNote ?? "")) {
        errors.push(
          `${relativePath}: ${t.slug} kaynagi quranenc ama licenseNote surum ` +
            "numarasi tasimiyor (QuranEnc yeniden yayin kosulu 3)",
        );
        break;
      }
      if (t.verseCount > 6236) {
        errors.push(`${relativePath}: ${t.slug} kapsami 6236 ayeti asiyor`);
        break;
      }
      for (const surahId of t.surahIds) {
        s.tafsirIndexClaims.add(`tafsir/${t.slug}/surah_${String(surahId)}.json`);
      }
    }
  }
}

export function checkTafsirFile({ relativePath, parsed }: StaticFile, s: StaticState): void {
  const result = staticTafsirSurah.safeParse(parsed);
  tick();
  if (!result.success) errors.push(`${relativePath}: ${result.error.message}`);
  else {
    s.tafsirFiles.add(relativePath);
    const expected = `tafsir/${result.data.tafsirSlug}/surah_${String(result.data.surahId)}.json`;
    if (expected !== relativePath) {
      errors.push(`${relativePath}: dosya adi icerikle uyusmuyor (${expected} bekleniyordu)`);
    } else {
      for (const b of result.data.blocks) {
        /*
         * Aralik ya tam ya bos. Yarim bir aralik "bu blok su ayete ait"
         * demenin uydurulmus hali olurdu; kaynak bagi olmayan blok
         * (sure adi, nuzul yeri, sure sonu) ayete BAGLANMAZ.
         */
        if ((b.startVerse === null) !== (b.endVerse === null)) {
          errors.push(`${relativePath}: ${String(b.sortNumber)} yarim ayet araligi`);
          break;
        }
        if (b.startVerse !== null && b.endVerse !== null && b.endVerse < b.startVerse) {
          errors.push(
            `${relativePath}: ${String(b.sortNumber)} ters aralik ` +
              `${String(b.startVerse)}-${String(b.endVerse)}`,
          );
          break;
        }
      }
    }
  }
}

export function checkMedia({ relativePath, parsed }: StaticFile, s: StaticState): void {
  const result = staticMedia.safeParse(parsed);
  tick();
  if (!result.success) errors.push(`${relativePath}: ${result.error.message}`);
  else {
    /*
     * Medya katmaninin uc kurali cikti uzerinde bir daha dogrulanir.
     * Veritabani kisitlari (media_item_license_gate, media_item_kind_split)
     * zaten ayni seyi soyluyor; buradaki tekrar bilincli, cunku cikti
     * dosyasi son sozdur ve yayina giden odur.
     *
     *   1. LISANS KAPISI (spec 34): kisitli lisansli kayit dosya yolu
     *      tasiyamaz — tasirsa sunucuya kopyalanmis olurdu.
     *   2. UC TUR KARISMAZ (spec 32): AI kaydi prompt tasir ve kaynak/
     *      lisans tasimaz; gercek kayit tam tersi.
     *   3. ATIF: CC atif lisanslarinda copyright bos birakilamaz.
     */
    const HOSTABLE = new Set([
      "PUBLIC_DOMAIN", "CC0", "CC_BY", "CC_BY_SA", "CC_BY_NC",
    ]);
    const ATTRIBUTION = new Set(["CC_BY", "CC_BY_SA", "CC_BY_NC"]);
    const seen = new Set<string>();
    for (const m of result.data.media) {
      if (seen.has(m.id)) {
        errors.push(`${relativePath}: '${m.id}' iki kez gecmis`);
        break;
      }
      seen.add(m.id);

      const isAi = m.kind === "AI_IMAGE" || m.kind === "AI_VIDEO";
      if (isAi) {
        if (m.promptId === null) {
          errors.push(`${relativePath}: ${m.id} AI kaydi ama prompt tasimiyor`);
          break;
        }
        if (m.license !== null || m.sourceName !== null || m.sourceUrl !== null) {
          errors.push(
            `${relativePath}: ${m.id} AI kaydinda kaynak/lisans alani var (spec 32)`,
          );
          break;
        }
      } else {
        if (m.promptId !== null) {
          errors.push(`${relativePath}: ${m.id} gercek medya ama AI prompt'u tasiyor`);
          break;
        }
        if (m.license === null || m.sourceName === null || m.sourceUrl === null) {
          errors.push(`${relativePath}: ${m.id} gercek medya kaynaksiz ya da lisanssiz`);
          break;
        }
        if (!HOSTABLE.has(m.license) && m.path !== null) {
          errors.push(
            `${relativePath}: ${m.id} lisansi '${m.license}' ama dosya yolu tasiyor — ` +
              `kisitli lisansli gorsel sunucuya kopyalanmaz (spec 34)`,
          );
          break;
        }
        if (ATTRIBUTION.has(m.license) && (m.copyright ?? "").trim() === "") {
          errors.push(`${relativePath}: ${m.id} lisansi atif zorunlu kiliyor, copyright bos`);
          break;
        }
      }
      if ((m.kind === "AI_VIDEO") !== (m.durationSec !== null)) {
        errors.push(`${relativePath}: ${m.id} sure alani turuyle uyusmuyor`);
        break;
      }
      s.mediaIds.add(m.id);
    }
  }
}

export function checkVerseMedia({ relativePath, parsed }: StaticFile, s: StaticState): void {
  const result = staticVerseMedia.safeParse(parsed);
  tick();
  if (!result.success) errors.push(`${relativePath}: ${result.error.message}`);
  else {
    for (const [key, ids] of Object.entries(result.data.verses)) {
      const id = Number(key);
      const surahId = Math.floor(id / 1000);
      if (surahId < 1 || surahId > 114 || id % 1000 === 0) {
        errors.push(`${relativePath}: gecersiz ayet anahtari ${key}`);
        break;
      }
      for (const mid of ids) s.verseMediaIds.add(mid);
    }
  }
}
