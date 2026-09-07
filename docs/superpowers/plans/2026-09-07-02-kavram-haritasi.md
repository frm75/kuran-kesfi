# Kavram Haritası — Uygulama Planı (2/3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 101 kavramı 8 üst kavrama bağlamak, elle yazılmış bağ ile hesaplanmış bağı ayırt edilebilir kılmak, ve kavram ağını JS'siz radyal SVG olarak çizmek.

**Architecture:** Taksonomi mevcut `concept.parent_id` alanına veri olarak yazılır — şema değişmez, ağaç üç seviyeye çıkar. Kosinüs benzerliği hattına **dokunulmaz**; yalnızca bağın kaynağını gösteren `origin` sütunu eklenir. Graf koordinatları Astro sayfasında build anında trigonometriyle üretilir; simülasyon, rastgelelik ve betik yoktur.

**Tech Stack:** PostgreSQL (yalnızca build makinesinde), TypeScript, Zod, Astro 5, inline SVG.

**Spec:** `docs/superpowers/specs/2026-09-07-menu-kavram-ilke-design.md` (Bölüm B)

## Global Constraints

- **JS eklenmez, CSP değişmez.** Graf inline SVG'dir.
- **Tekrarlanabilir build** (plan §20.1): koordinatlar yalnızca `Math.sin`/`Math.cos` ve veri sırasından türer. Rastgelelik, zaman damgası, iterasyon yok.
- **Kosinüs hesaplama hattına dokunulmaz** — `scripts/import/content.ts:622-659` olduğu gibi kalır.
- **Kaynaksız bağ kaynaklı gibi gösterilmez** (`CLAUDE.md` kural 4): hesaplanan bağ arayüzde ayrı etiketlenir.
- **Her grafiğin altında gerçek liste bulunur** (plan §12) — liste birincil içerik, grafik onun görsel özeti.
- **Renk tek başına anlam taşımaz**; gruplar renk **ve** konumla ayrılır.
- Ölçülen graf gerçekleri (Task 2 sonrası, `origin` ile): 543 tekil yönsüz çift = **117 curated** (contrast 25, cause 12, part_of 14, co_occurrence 66) + **426 computed** (ağırlık 3/2/1 = 8/125/293); derece min 3, medyan 9, maks 90 (`ilah`); ilişkisiz kavram 0. Atlas bütçesi **125 kenar / 109 düğüm**.

---

### Task 1: Üst kavram katmanı

**Files:**
- Create: `data/concepts/concept_tevhid-ve-allah.json` ve 7 kardeşi
- Modify: `packages/schema/src/content_input.ts:204-230` (`conceptInput` refine)
- Modify: `scripts/import/content.ts:291-296` (küme düzeyi denetim)
- Modify: 101 mevcut `data/concepts/concept_*.json` (`parentSlug`)

**Interfaces:**
- Consumes: yok
- Produces: 8 yeni kavram slug'ı; `data/concepts/**` içinde `parentSlug` dolu 101 dosya

- [ ] **Step 1: Sekiz üst kavram dosyasını yaz**

`data/concepts/concept_tevhid-ve-allah.json` — tam örnek:

```json
{
  "slug": "tevhid-ve-allah",
  "nameTr": "Tevhid ve Allah",
  "nameAr": "التوحيد والألوهية",
  "definition": "Allah'ın birliği, isimleri, sıfatları ve fiilleri etrafında toplanan kavramlar. Bu bir üst başlıktır; kendi kökü yoktur, sayıları alt kavramlarından toplanır.",
  "parentSlug": null,
  "roots": [],
  "sourceSlugs": ["tdv-islam-ansiklopedisi"],
  "relations": [],
  "verses": []
}
```

Kalan yedisi aynı biçimde; yalnızca üç alan değişir:

| slug | nameTr | nameAr |
|---|---|---|
| `vahiy-ve-peygamberlik` | Vahiy ve Peygamberlik | الوحي والنبوة |
| `insan-ve-nefs` | İnsan ve Nefs | الإنسان والنفس |
| `iman-ve-kufur` | İman ve Küfür | الإيمان والكفر |
| `amel-ve-ibadet` | Amel ve İbadet | العمل والعبادة |
| `ahlak-ve-toplum` | Ahlak ve Toplum | الأخلاق والمجتمع |
| `imtihan-ve-kader` | İmtihan ve Kader | الابتلاء والقدر |
| `ahiret-ve-hesap` | Ahiret ve Hesap | الآخرة والحساب |

`definition` her biri için kendi alanını tarif eden bir cümle + aynı "Bu bir üst başlıktır…" cümlesi. Bölümleme editoryal bir karardır; `sourceSlugs` hepsinde `tdv-islam-ansiklopedisi` kalır ve sayfada "bu bölümleme platform derlemesidir" notu görünür (Task 5).

- [ ] **Step 2: `conceptInput` refine'ını gevşet**

`packages/schema/src/content_input.ts` içinde `conceptInput`'un ilk `.refine()` bloğu şu an köksüz kavramı reddediyor:

```ts
  .refine((c) => c.roots.length > 0 || c.verses.length > 0, {
    message: "kavramin en az bir koku ya da elle ayet eslestirmesi olmali",
    path: ["roots"],
  })
```

Bu blok **silinir**. Yerine kural küme düzeyine taşınır (Step 3) — tek dosyanın zod'u "bu kavramın çocuğu var mı" sorusunu göremez. Silinen kuralın gerekçesi yorumla korunur:

```ts
  /*
   * "En az bir kök ya da elle ayet eşleştirmesi" kuralı buradan KALDIRILDI
   * (2026-09-07): üst kavramların kendi kökü yok, sayıları çocuklarından
   * toplanıyor. Kural kaybolmadı, küme düzeyine taşındı — tek dosyanın şeması
   * "bu kavramın çocuğu var mı" sorusunu göremez.
   * Bkz. scripts/import/content.ts, kavram denetimleri.
   */
```

- [ ] **Step 3: Küme düzeyi denetimi ekle**

`scripts/import/content.ts` içinde kavram denetimlerinin olduğu döngüye (satır ~291) ekle:

```ts
  const conceptChildCount = new Map<string, number>();
  for (const c of data.concepts) {
    if (c.parentSlug !== null) {
      conceptChildCount.set(c.parentSlug, (conceptChildCount.get(c.parentSlug) ?? 0) + 1);
    }
  }
  for (const c of data.concepts) {
    // Koku ve elle ayet eslestirmesi olmayan kavram ancak UST BASLIK olabilir:
    // sayilari cocuklarindan toplanir. Cocugu da yoksa sayfasi bos cikardi.
    if (c.roots.length === 0 && c.verses.length === 0 && (conceptChildCount.get(c.slug) ?? 0) === 0) {
      parseErrors.push(`kavram ${c.slug}: kok, ayet ve cocuk yok — bos kavram sayfasi uretilemez`);
    }
  }
```

- [ ] **Step 4: 101 kavrama `parentSlug` yaz**

Eşleme scripti — tek seferlik, çalıştırıldıktan sonra silinir:

```bash
cd /opt/kuran && node -e '
const fs = require("fs");
const M = {
  "tevhid-ve-allah": ["fazl","ilah","izzet","kudret","mulk","nur","nusret","rahmet","riza","tevhid","velayet"],
  "vahiy-ve-peygamberlik": ["ayet","hikmet","ilim","kiraat","kitap","mesel","mujde","nubuvvet","nuzul","risalet","uyari","vahiy"],
  "insan-ve-nefs": ["dunya","hayat","isitme-gorme","kalp","nefs","olum","su","yaratilis","zan"],
  "iman-ve-kufur": ["curum","dalalet","din","hidayet","iman","islam","itaat","ittiba","kufur","sebil","sidk","yalan"],
  "amel-ve-ibadet": ["amel","cihad","dua","hamd","ibadet","infak","namaz","sabir","sukur","takva","tesbih","tevekkul","zekat","zikir"],
  "ahlak-ve-toplum": ["adalet","ahid","birr","emanet","hak","helal-haram","hilafet","ihsan","kadin-erkek-hak","kibir","sahitlik","sevgi","tevazu-kavram","ummet","zulum"],
  "imtihan-ve-kader": ["ecel","hayir","helak","imtihan","kader","korku","nimet","rizik","ser","seytan","umut"],
  "ahiret-ve-hesap": ["af","ahiret","azap","cennet","dirilis","ebedilik","ecir","hesap","husran","karsilik","kurtulus","magfiret","sefaat","tevbe","vaad"],
};
const parentOf = {};
for (const [g, kids] of Object.entries(M)) for (const k of kids) parentOf[k] = g;
// sirk ve fisk KORUNUR: parent kufur kalir, agac uc seviye olur.
const KORUNAN = new Set(["sirk", "fisk"]);
let yazildi = 0, atlandi = 0;
for (const f of fs.readdirSync("data/concepts")) {
  if (!f.endsWith(".json")) continue;
  const p = "data/concepts/" + f;
  const j = JSON.parse(fs.readFileSync(p, "utf8"));
  if (KORUNAN.has(j.slug)) { atlandi++; continue; }
  if (Object.keys(M).includes(j.slug)) { atlandi++; continue; }
  const parent = parentOf[j.slug];
  if (!parent) { console.error("ESLEME YOK:", j.slug); process.exitCode = 1; continue; }
  j.parentSlug = parent;
  fs.writeFileSync(p, JSON.stringify(j, null, 2) + "\n");
  yazildi++;
}
console.log("yazildi:", yazildi, "| atlandi (ust baslik + sirk/fisk):", atlandi);
'
```

Beklenen: `yazildi: 99 | atlandi (ust baslik + sirk/fisk): 10`.
"ESLEME YOK" satırı çıkarsa **dur** — eşleme tablosu eksiktir, tahminle doldurma.

- [ ] **Step 5: Bütünlüğü doğrula**

```bash
cd /opt/kuran && node -e '
const fs=require("fs");
const cs=fs.readdirSync("data/concepts").filter(f=>f.endsWith(".json"))
  .map(f=>JSON.parse(fs.readFileSync("data/concepts/"+f,"utf8")));
const slugs=new Set(cs.map(c=>c.slug));
console.log("toplam kavram:", cs.length);
console.log("ust baslik (parentSlug=null):", cs.filter(c=>!c.parentSlug).length);
const kayip=cs.filter(c=>c.parentSlug&&!slugs.has(c.parentSlug));
console.log("olmayan ebeveyne baglanan:", kayip.length, kayip.map(c=>c.slug).join(" "));
const derinlik=c=>{let d=0,x=c;while(x.parentSlug){d++;x=cs.find(y=>y.slug===x.parentSlug);if(!x||d>5)break;}return d;};
const dd={};for(const c of cs)dd[derinlik(c)]=(dd[derinlik(c)]||0)+1;
console.log("derinlik dagilimi:", dd);'
```

Beklenen: `toplam kavram: 109`, `ust baslik: 8`, `olmayan ebeveyne baglanan: 0`, derinlik dağılımı `{0: 8, 1: 99, 2: 2}`.

- [ ] **Step 6: İçe aktar ve derle**

```bash
cd /opt/kuran && pnpm content:import && pnpm build:data && pnpm lint:refs
```

- [ ] **Step 7: Commit**

```bash
cd /opt/kuran
git add data/concepts packages/schema/src/content_input.ts scripts/import/content.ts
git commit -m "feat(kavram): 8 ust kavram eklendi, 101 kavram taksonomiye baglandi

101 kavramin 99'u parentSlug: null durumdaydi; 'ust kavram -> alt kavram
agaci' pratikte 99 kutuluk duz izgaraydi. Sema DEGISMEDI - concept.parent_id
zaten vardi, eksik olan veriydi.

kufur -> fisk/sirk bagi korundu; agac uc seviyeye cikti.

conceptInput'un 'en az bir kok ya da ayet' kurali kume duzeyine tasindi:
ust kavramin kendi koku yok, tek dosyanin zod'u 'bu kavramin cocugu var mi'
sorusunu goremiyor. Kural kaybolmadi, kokusuz VE cocuksuz kavram hala
reddediliyor.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Bağın kaynağı — `origin` ayrımı

Şu an bir bağın elle mi yazıldığı yoksa kosinüs istatistiğinden mi geldiği **görünmüyor**. 543 çiftin 492'si hesaplanmış; arayüz hepsini aynı gösteriyor. Bu `CLAUDE.md` kural 4'e aykırı.

**Files:**
- Modify: `infra/db/schema.sql:86` (enum) ve `:556-563` (`concept_relation`)
- Modify: `scripts/import/content.ts:618` (elle) ve `:658` (hesaplanan)
- Modify: `scripts/build/lib/content.ts:212` (sorgu) ve `:417-424` (eşleme)
- Modify: `packages/schema/src/concept.ts` (enum tipi)
- Modify: `packages/schema/src/static_content.ts:257-259` (`staticConcept.relations`)
- Modify: `apps/web/src/pages/kavram/[slug].astro` (etiket)

**Interfaces:**
- Consumes: Task 1'in taksonomisi
- Produces: `relationOrigin = z.enum(["curated", "computed"])`; `staticConcept.relations[].origin`

- [ ] **Step 1: Şemaya enum ve sütunu ekle**

`infra/db/schema.sql`, `concept_relation_type` enum'unun hemen altına:

```sql
-- Bir baglantinin ELLE mi yazildigi yoksa istatistikten mi geldigi.
-- Arayuz ikisini ayri etiketler: kaynaksiz bag kaynakli gibi gosterilmez
-- (CLAUDE.md kural 4). 2026-09-07.
CREATE TYPE relation_origin AS ENUM ('curated', 'computed');
```

`concept_relation` tablosuna sütun (varsayılan yok — her satır kaynağını açıkça yazsın):

```sql
  origin            relation_origin NOT NULL,
```

- [ ] **Step 2: Şema deltasını CANLI veritabanına uygula — `down -v` YAPMA**

**Bu adım 2026-09-07'de değişti.** Önceki hâli `docker compose down -v` ile veritabanını
sıfırdan kurduruyordu. Ölçüldü: veritabanı **279 MB, 56 tablo** ve içinde
**336 537 meal satırı, 6236 ayet, 1641 kök** var. Bunlar `data:import`'tan gelir ve
`content:import` onlara **dokunmaz** (`CONTENT_TABLES` yalnızca içerik katmanını sayar).
`down -v` bu katmanı yok eder ve saatler süren bir yeniden import gerektirirdi — hiçbir
karşılığı olmadan.

Doğru yol: DDL'i çalışan veritabanına uygula. `concept_relation` zaten her import'ta
`TRUNCATE` ediliyor, bu yüzden boş tabloya `NOT NULL` sütun eklemek sorunsuz:

```bash
docker exec kuran-pg psql -U kuran -d kuran -v ON_ERROR_STOP=1 <<'SQL'
BEGIN;
CREATE TYPE relation_origin AS ENUM ('curated', 'computed');
TRUNCATE concept_relation;
ALTER TABLE concept_relation ADD COLUMN origin relation_origin NOT NULL;
COMMIT;
SQL
```

Doğrula:

```bash
docker exec kuran-pg psql -U kuran -d kuran -c "\d concept_relation"
```

`origin | relation_origin | not null` satırını görmelisin.

**`infra/db/schema.sql` yine de güncellenir** (Step 1) — o dosya sıfırdan kurulan bir
veritabanının kaynağıdır. İki yer birlikte değişir: canlı DB delta ile, `schema.sql`
gelecекteki temiz kurulum için.

- [ ] **Step 3: Import'ta `origin` yaz**

`scripts/import/content.ts` içinde elle yazılan ilişkilerin insert'ü (satır ~618):

```ts
    await insertPlain(
      client,
      "concept_relation",
      ["source_concept_id", "target_concept_id", "relation_type", "weight", "origin"],
      [...manualMap.values()].map((row) => [...row, "curated"]),
    );
```

Hesaplananların insert'ü (satır ~658):

```ts
    await insertPlain(
      client,
      "concept_relation",
      ["source_concept_id", "target_concept_id", "relation_type", "weight", "origin"],
      coRows,
    );
```

ve `coRows.push` satırı `origin` taşısın:

```ts
      coRows.push([a, b, "co_occurrence", weight, "computed"]);
```

- [ ] **Step 4: Zod tipini ekle**

`packages/schema/src/concept.ts`, `conceptRelationType`'ın altına:

```ts
/** Baglantinin kaynagi: insan karari mi, istatistik mi. */
export const relationOrigin = z.enum(["curated", "computed"]);
export type RelationOrigin = z.infer<typeof relationOrigin>;
```

`packages/schema/src/static_content.ts` içinde `staticConcept.relations` satırını değiştir:

```ts
  relations: z.array(
    namedSlug.extend({
      type: conceptRelationType,
      weight: z.number().int().min(1).max(3),
      origin: relationOrigin,
    }),
  ),
```

`relationOrigin`'i aynı dosyanın import bloğuna ekle.

- [ ] **Step 5: Build'de dışa aktar**

`scripts/build/lib/content.ts:212` sorgusunu genişlet:

```ts
  const conceptRelations = await q<{ source_concept_id: number; target_concept_id: number; relation_type: "co_occurrence" | "cause" | "contrast" | "part_of"; weight: number; origin: "curated" | "computed" }>(
    "SELECT * FROM concept_relation ORDER BY 1, 2, 3",
  );
```

`:422` eşlemesine `origin` ekle:

```ts
        return { slug: o.slug, nameTr: o.name_tr, type: r.relation_type, weight: r.weight, origin: r.origin };
```

- [ ] **Step 6: Arayüzde etiketle**

`apps/web/src/pages/kavram/[slug].astro` içinde ilişkiler listelenen bölümde, `origin === "computed"` olan bağa rozet bas:

```astro
{relation.origin === "computed" && (
  <span class="rel-origin" title="Bu bağ iki kavramın ortak ayetlerinden hesaplandı; bir kaynağın kurduğu bağ değildir.">
    hesaplanmış
  </span>
)}
```

CSS'i `global.css` sonuna:

```css
.rel-origin {
  margin-inline-start: var(--space-2);
  padding: 0 var(--space-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  color: var(--text-secondary);
  font-size: var(--text-xs);
}
```

`--text-xs` tanımlı değilse `--text-sm` kullan (doğrula: `grep -n -- "--text-xs:" apps/web/src/styles/global.css`).

- [ ] **Step 7: Tam zinciri çalıştır ve dağılımı doğrula**

```bash
cd /opt/kuran && pnpm content:import && pnpm build:data
node -e '
const fs=require("fs");const d="apps/web/public/data/concept";
const o={};for(const f of fs.readdirSync(d)){const j=JSON.parse(fs.readFileSync(d+"/"+f,"utf8"));
 for(const r of j.relations||[])o[r.origin]=(o[r.origin]||0)+1;}
console.log(o);'
```

Beklenen: `curated` ve `computed` ikisi de dolu; `computed` çoğunluk (ölçüm: 984/1086 uç).

- [ ] **Step 8: Commit**

```bash
cd /opt/kuran
git add infra/db/schema.sql scripts/import/content.ts scripts/build/lib/content.ts \
        packages/schema/src/concept.ts packages/schema/src/static_content.ts \
        apps/web/src/pages/kavram/\[slug\].astro apps/web/src/styles/global.css
git commit -m "feat(kavram): bag kaynagi artik gorunuyor (curated/computed)

543 kavram ciftinin 492'si kosinus benzerliginden hesaplanmis, 51'i elle
yazilmisti; arayuz ikisini AYNI gosteriyordu. Kaynaksiz bagi kaynakli gibi
gostermek CLAUDE.md kural 4'e aykiri.

Hesaplama hattina DOKUNULMADI - yalnizca satirin nereden geldigini yazan
origin sutunu eklendi. Varsayilan deger koyulmadi: her satir kaynagini
acikca yazsin.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: `concepts_index.json` ilişki taşısın

Atlas sayfası 109 ayrı dosya yerine tek dosya okusun.

**Files:**
- Modify: `packages/schema/src/static_content.ts:264-278` (`staticConceptsIndex`)
- Modify: `scripts/build/lib/content.ts:456-459` (`conceptsIndex.push`)

**Interfaces:**
- Consumes: `relationOrigin` (Task 2)
- Produces: `StaticConceptsIndex.concepts[].relations` — atlas ve grup sayfalarının tek veri kaynağı

- [ ] **Step 1: Şemayı genişlet**

`staticConceptsIndex` içindeki nesneye ekle:

```ts
        /*
         * Atlas sayfasi icin. Kavram basina EN AZ 6, ama elle yazilan bag
         * hepsi: tam liste concept_<slug>.json icinde duruyor, dizin dosyasi
         * grafigi cizebilecek kadarini tasiyor. Olculen derece medyani 9,
         * maksimum 90 (ilah) — sinirsiz tasisak dizin dosyasi uc katina
         * cikardi. Curated hicbir zaman kesilmez (bkz. build/lib/content.ts).
         */
        relations: z.array(
          z.object({
            slug,
            type: conceptRelationType,
            weight: z.number().int().min(1).max(3),
            origin: relationOrigin,
          }),
        ),
```

- [ ] **Step 2: Build'de doldur**

`scripts/build/lib/content.ts` içindeki `conceptsIndex.push` çağrısını değiştir:

```ts
    conceptsIndex.push({
      slug: c.slug, nameTr: c.name_tr, nameAr: c.name_ar, definition: c.definition,
      parentSlug: parent?.slug ?? null, verseCount: vs.length, rootCount: (conceptRoots.get(c.id) ?? []).length,
      /*
       * Atlas icin bag listesi. Kural: ELLE YAZILAN HICBIR BAG KESILMEZ,
       * kalan yer en guclu hesaplananlarla 6'ya tamamlanir.
       *
       * Neden duz `.slice(0, 6)` DEGIL: olculdu, `iman` 10 ve `adalet` 7
       * curated bag tasiyor. Duz kesme bunlari kendi taraflarindan dusurur.
       * Bugun sansliyiz — her curated cift kars_i uctan hayatta kaliyor, yani
       * atlas (cifti tekillestirdigi icin) 117'sini de cizebiliyor. Ama bu
       * VERIYE BAGLI bir tesaduf: iki ucu da 6'yi asan bir cift eklenirse
       * kenar SESSIZCE kaybolur ve kimse fark etmez. Insan karari istatistige
       * feda edilmez; kural veriden bagimsiz olsun.
       */
      relations: (() => {
        const curated = rel.filter((r) => r.origin === "curated");
        const computed = rel.filter((r) => r.origin === "computed");
        return [...curated, ...computed.slice(0, Math.max(0, 6 - curated.length))].map((r) => ({
          slug: r.slug,
          type: r.type,
          weight: r.weight,
          origin: r.origin,
        }));
      })(),
    });
```

- [ ] **Step 3: Derle ve dizin dosyasını ölç**

```bash
cd /opt/kuran && pnpm build:data
ls -l apps/web/public/data/concepts_index.json
node -e '
const j=require("./apps/web/public/data/concepts_index.json");
const n=j.concepts.reduce((a,c)=>a+c.relations.length,0);
console.log("kavram:",j.concepts.length,"| iliski ucu:",n,"| ortalama:",(n/j.concepts.length).toFixed(1));
console.log("6dan fazla tasiyan:",j.concepts.filter(c=>c.relations.length>6).length);
console.log("ust baslik iliskisi:",j.concepts.filter(c=>c.parentSlug===null).reduce((a,c)=>a+c.relations.length,0));'
```

Beklenen: 109 kavram. **Çoğu kavram ≤6 bağ taşır, ama `iman` (10 curated) ve `adalet`
(7 curated) daha fazlasını taşır** — kural "elle yazılan kesilmez". Doğrulama scripti bunu
hata saymamalı; kesilmiş curated bağ olup olmadığını denetlemeli:

```bash
node -e '
const idx=require("./apps/web/public/data/concepts_index.json").concepts;
const fs=require("fs");const d="apps/web/public/data/concept";
let eksik=0;
for(const c of idx){
  const tam=JSON.parse(fs.readFileSync(d+"/concept_"+c.slug+".json","utf8"));
  const tamCur=tam.relations.filter(r=>r.origin==="curated").map(r=>r.slug).sort().join(",");
  const idxCur=c.relations.filter(r=>r.origin==="curated").map(r=>r.slug).sort().join(",");
  if(tamCur!==idxCur){eksik++;console.log("KESILMIS curated:",c.slug);}
}
const n=idx.reduce((a,c)=>a+c.relations.length,0);
console.log("kavram:",idx.length,"| iliski ucu:",n,"| ortalama:",(n/idx.length).toFixed(1));
console.log("6dan fazla tasiyan:",idx.filter(c=>c.relations.length>6).map(c=>c.slug+":"+c.relations.length).join(" "));
console.log("KESILMIS curated tasiyan kavram:",eksik,"(0 olmali)");'
```

Beklenen: `KESILMIS curated tasiyan kavram: 0`, `6dan fazla tasiyan: adalet:7 iman:10`.
Dosya ~23 KB'tan ~45 KB'a çıkar; yalnızca build anında okunur, tarayıcıya gitmez.

- [ ] **Step 4: Commit**

```bash
cd /opt/kuran
git add packages/schema/src/static_content.ts scripts/build/lib/content.ts
git commit -m "feat(kavram): concepts_index.json iliski tasiyor

Atlas sayfasi 109 ayri dosya yerine tek dosya okusun. Kavram basina en
fazla 6 bag; once elle yazilanlar, kalan yer hesaplananlarla doluyor -
insan karari her zaman grafige giriyor.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Radyal yerleşim kütüphanesi

**Files:**
- Create: `apps/web/src/lib/graf.ts`
- Create: `apps/web/src/lib/__tests__/graf.smoke.ts`
- Modify: `apps/web/package.json` (`test:smoke`)

**Interfaces:**
- Consumes: `StaticConceptsIndex` biçimi (Task 3)
- Produces:
  - `interface GrafDugum { slug: string; label: string; grup: string; derinlik: number; x: number; y: number; r: number }`
  - `interface GrafKenar { a: string; b: string; type: string; weight: number; origin: string }`
  - `interface GrafYerlesim { dugumler: GrafDugum[]; kenarlar: GrafKenar[]; boyut: number }`
  - `function radyalYerlesim(girdi: RadyalGirdi): GrafYerlesim`
  - `function kirisYolu(a: GrafDugum, b: GrafDugum, merkez: number): string`

- [ ] **Step 1: Testi yaz**

`apps/web/src/lib/__tests__/graf.smoke.ts`:

```ts
/**
 * Radyal yerlesim duman testleri.
 *
 * En kritik ozellik DETERMINIZM: plan §20.1 ayni girdinin ayni baytlari
 * uretmesini istiyor. Biri bu dosyayi bir gun force-directed simulasyona
 * cevirirse ilk test duser.
 *
 * Calistirma:  pnpm --filter @kuran/web test:smoke
 */

import { radyalYerlesim, kirisYolu } from "../graf.js";
import type { RadyalGirdi } from "../graf.js";

let passed = 0;
const failures: string[] = [];
function check(label: string, ok: boolean): void {
  if (ok) { passed += 1; console.log(`  ok   ${label}`); }
  else { failures.push(label); console.error(`  HATA ${label}`); }
}

const girdi: RadyalGirdi = {
  boyut: 900,
  gruplar: [
    { slug: "g1", label: "Grup 1", cocuklar: [
      { slug: "a", label: "A", agirlik: 10 },
      { slug: "b", label: "B", agirlik: 40 },
    ] },
    { slug: "g2", label: "Grup 2", cocuklar: [
      { slug: "c", label: "C", agirlik: 25 },
    ] },
  ],
  kenarlar: [{ a: "a", b: "c", type: "contrast", weight: 3, origin: "curated" }],
};

console.log("1. Determinizm");
const bir = radyalYerlesim(girdi);
const iki = radyalYerlesim(girdi);
check("ayni girdi ayni ciktiyi verir", JSON.stringify(bir) === JSON.stringify(iki));

console.log("");
console.log("2. Yerlesim");
check("her dugum uretildi", bir.dugumler.length === 5); // 2 grup + 3 cocuk
check(
  "hicbir dugum gorus alani disinda degil",
  bir.dugumler.every((d) => d.x - d.r >= 0 && d.x + d.r <= girdi.boyut && d.y - d.r >= 0 && d.y + d.r <= girdi.boyut),
);
check(
  "buyuk agirlik buyuk yaricap",
  (bir.dugumler.find((d) => d.slug === "b")?.r ?? 0) > (bir.dugumler.find((d) => d.slug === "a")?.r ?? 0),
);
check(
  "grup dugumleri cocuklarindan ice yakin",
  bir.dugumler.filter((d) => d.derinlik === 0).every((g) => {
    const merkez = girdi.boyut / 2;
    const gr = Math.hypot(g.x - merkez, g.y - merkez);
    return bir.dugumler.filter((d) => d.derinlik === 1 && d.grup === g.slug)
      .every((c) => Math.hypot(c.x - merkez, c.y - merkez) > gr);
  }),
);
check(
  "hicbir dugum cifti cakismiyor",
  bir.dugumler.every((d1, i) =>
    bir.dugumler.slice(i + 1).every((d2) => Math.hypot(d1.x - d2.x, d1.y - d2.y) > d1.r + d2.r - 0.01),
  ),
);

console.log("");
console.log("3. Kenarlar");
check("kenar korundu", bir.kenarlar.length === 1);
const a = bir.dugumler.find((d) => d.slug === "a");
const c = bir.dugumler.find((d) => d.slug === "c");
check(
  "kiris yolu gecerli SVG path",
  a !== undefined && c !== undefined && /^M [\d.-]+ [\d.-]+ Q [\d.-]+ [\d.-]+ [\d.-]+ [\d.-]+$/.test(kirisYolu(a, c, girdi.boyut / 2)),
);

console.log("");
console.log("4. Bos girdi");
const bos = radyalYerlesim({ boyut: 900, gruplar: [], kenarlar: [] });
check("bos girdi patlamiyor", bos.dugumler.length === 0 && bos.kenarlar.length === 0);

console.log("");
if (failures.length > 0) {
  console.error(`${String(passed)} test gecti, ${String(failures.length)} basarisiz:`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`${String(passed)} test gecti, 0 basarisiz`);
```

- [ ] **Step 2: Testi çalıştır, başarısız olduğunu gör**

```bash
cd /opt/kuran && pnpm --filter @kuran/web exec tsx src/lib/__tests__/graf.smoke.ts
```

Beklenen: `Cannot find module '../graf.js'`.

- [ ] **Step 3: `graf.ts` dosyasını yaz**

`apps/web/src/lib/graf.ts`:

```ts
/**
 * Radyal taksonomi yerleşimi — kavram atlası ve ilke atlası ortak kullanır.
 *
 * ## Neden simülasyon değil trigonometri
 *
 * Force-directed yerleşim her çalıştığında biraz başka koordinat üretir.
 * Plan §20.1 tekrarlanabilir build istiyor: aynı girdi aynı baytları
 * vermeli. Buradaki her koordinat açı ve yarıçaptan türer; rastgelelik,
 * iterasyon ve zaman damgası yoktur.
 *
 * ## Neden bu dosyada SVG yok
 *
 * Yerleşim sayı üretir, çizim sayfanın işidir. Böylece aynı yerleşim hem
 * kavram atlasında hem ilke atlasında, farklı görsel dille kullanılabiliyor.
 */

export interface RadyalCocuk {
  slug: string;
  label: string;
  /** Düğüm büyüklüğünü belirler — kavramda ayet sayısı, ilkede dayanak sayısı */
  agirlik: number;
  /** Üçüncü seviye: bu çocuğun da çocukları varsa */
  altlar?: readonly RadyalCocuk[];
}

export interface RadyalGrup {
  slug: string;
  label: string;
  cocuklar: readonly RadyalCocuk[];
}

export interface RadyalKenar {
  a: string;
  b: string;
  type: string;
  weight: number;
  origin: string;
}

export interface RadyalGirdi {
  /** Kare görüş alanının kenarı (px) */
  boyut: number;
  gruplar: readonly RadyalGrup[];
  kenarlar: readonly RadyalKenar[];
}

export interface GrafDugum {
  slug: string;
  label: string;
  /** Ait olduğu grup slug'ı; grup düğümünde kendi slug'ı */
  grup: string;
  /** 0 grup, 1 kavram, 2 alt kavram */
  derinlik: number;
  x: number;
  y: number;
  r: number;
}

export interface GrafYerlesim {
  dugumler: GrafDugum[];
  kenarlar: RadyalKenar[];
  boyut: number;
}

/** En büyük düğüm yarıçapı; görüş alanının kenarına göre ölçeklenir. */
const MAKS_YARICAP = 0.018;
const MIN_YARICAP = 0.006;

/**
 * Grupları açı dilimlerine böler, çocukları kendi diliminde yaya dizer.
 *
 * Yarıçap katmanları (görüş alanı kenarının oranı olarak):
 *   grup       0.26   — iç halka
 *   kavram     0.40   — orta halka
 *   alt kavram 0.47   — ebeveyninin hemen dışında
 *
 * Dilim payı çocuk sayısına göredir, ayet sayısına göre DEĞİL: 14 çocuklu
 * grup 9 çocukluyla aynı açıyı alsaydı düğümleri üst üste binerdi.
 */
export function radyalYerlesim(girdi: RadyalGirdi): GrafYerlesim {
  const { boyut, gruplar, kenarlar } = girdi;
  const merkez = boyut / 2;
  const dugumler: GrafDugum[] = [];

  if (gruplar.length === 0) return { dugumler, kenarlar: [...kenarlar], boyut };

  const toplamCocuk = gruplar.reduce((a, g) => a + Math.max(1, g.cocuklar.length), 0);
  const enBuyukAgirlik = Math.max(
    1,
    ...gruplar.flatMap((g) => g.cocuklar.flatMap((c) => [c.agirlik, ...(c.altlar ?? []).map((x) => x.agirlik)])),
  );

  // Ağırlık → yarıçap. Karekök: göz ALANI karşılaştırır, çapı değil.
  const yaricap = (agirlik: number): number =>
    boyut * (MIN_YARICAP + (MAKS_YARICAP - MIN_YARICAP) * Math.sqrt(Math.max(0, agirlik) / enBuyukAgirlik));

  const nokta = (aci: number, oran: number): { x: number; y: number } => ({
    x: merkez + Math.cos(aci) * boyut * oran,
    y: merkez + Math.sin(aci) * boyut * oran,
  });

  // -PI/2: ilk grup tepede başlasın, saat yönünde ilerlesin.
  let aci = -Math.PI / 2;
  for (const grup of gruplar) {
    const pay = (Math.max(1, grup.cocuklar.length) / toplamCocuk) * Math.PI * 2;
    const grupMerkezAci = aci + pay / 2;
    const gp = nokta(grupMerkezAci, 0.26);
    dugumler.push({
      slug: grup.slug,
      label: grup.label,
      grup: grup.slug,
      derinlik: 0,
      x: gp.x,
      y: gp.y,
      r: boyut * MAKS_YARICAP,
    });

    const n = grup.cocuklar.length;
    grup.cocuklar.forEach((cocuk, i) => {
      // Dilimin kenarlarına yapışmasın diye (i + 0.5) / n
      const ca = aci + (pay * (i + 0.5)) / Math.max(1, n);
      const cp = nokta(ca, 0.4);
      dugumler.push({
        slug: cocuk.slug,
        label: cocuk.label,
        grup: grup.slug,
        derinlik: 1,
        x: cp.x,
        y: cp.y,
        r: yaricap(cocuk.agirlik),
      });

      const altlar = cocuk.altlar ?? [];
      altlar.forEach((alt, j) => {
        // Ebeveynin açısı etrafında küçük bir yelpaze
        const yelpaze = (pay / Math.max(1, n)) * 0.6;
        const aa = ca + yelpaze * ((j + 0.5) / altlar.length - 0.5);
        const ap = nokta(aa, 0.47);
        dugumler.push({
          slug: alt.slug,
          label: alt.label,
          grup: grup.slug,
          derinlik: 2,
          x: ap.x,
          y: ap.y,
          r: yaricap(alt.agirlik),
        });
      });
    });

    aci += pay;
  }

  return { dugumler, kenarlar: [...kenarlar], boyut };
}

/**
 * İki düğüm arasında çemberin içinden geçen kiriş.
 *
 * Kontrol noktası merkeze doğru çekilir; düz çizgi olsaydı uzak çiftlerin
 * bağı grafiğin ortasında birbirini keserdi ve hiçbiri okunmazdı.
 */
export function kirisYolu(a: GrafDugum, b: GrafDugum, merkez: number): string {
  const ox = (a.x + b.x) / 2;
  const oy = (a.y + b.y) / 2;
  // 0.45: orta noktayı merkeze doğru bu oranda çeker. 0 düz çizgi, 1 merkezden geçer.
  const kx = ox + (merkez - ox) * 0.45;
  const ky = oy + (merkez - oy) * 0.45;
  const yuvarla = (n: number): string => (Math.round(n * 100) / 100).toString();
  return `M ${yuvarla(a.x)} ${yuvarla(a.y)} Q ${yuvarla(kx)} ${yuvarla(ky)} ${yuvarla(b.x)} ${yuvarla(b.y)}`;
}
```

- [ ] **Step 4: Testi çalıştır, geçtiğini gör**

```bash
cd /opt/kuran && pnpm --filter @kuran/web exec tsx src/lib/__tests__/graf.smoke.ts
```

Hepsi geçmeli. "hicbir dugum cifti cakismiyor" testi düşerse `MAKS_YARICAP` küçültülür ya da halka oranları (`0.26` / `0.40` / `0.47`) açılır — testi gevşetme, yerleşimi düzelt.

- [ ] **Step 5: `test:smoke`'a ekle ve commit**

`apps/web/package.json`:

```json
"test:smoke": "tsx src/lib/gunluk/__tests__/fsrs.smoke.ts && tsx src/lib/__tests__/nav.smoke.ts && tsx src/lib/__tests__/graf.smoke.ts"
```

```bash
cd /opt/kuran && pnpm --filter @kuran/web test:smoke
git add apps/web/src/lib/graf.ts apps/web/src/lib/__tests__/graf.smoke.ts apps/web/package.json
git commit -m "feat(graf): deterministik radyal yerlesim kutuphanesi

Koordinatlar aci ve yaricaptan turuyor; rastgelelik, iterasyon ve zaman
damgasi yok. Force-directed olsaydi her build baska koordinat uretir ve
tekrarlanabilir build (plan 20.1) bozulurdu - ilk duman testi tam bunu
denetliyor.

Yerlesim sayi uretir, cizim sayfanin isi. Ayni yerlesim hem kavram hem
ilke atlasinda kullanilacak.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Kavram atlası ve grup sayfaları

**Files:**
- Create: `apps/web/src/components/RadyalAtlas.astro`
- Modify: `apps/web/src/pages/kavramlar.astro`
- Create: `apps/web/src/pages/kavram/grup/[slug].astro`
- Modify: `apps/web/src/styles/global.css`
- Modify: `apps/web/src/pages/sitemap.xml.ts`

**Interfaces:**
- Consumes: `radyalYerlesim`, `kirisYolu` (Task 4); `concepts_index.json` `relations` (Task 3)
- Produces: `<RadyalAtlas yerlesim={GrafYerlesim} baslik={string} aciklama={string} hrefOnEk={string} />`

- [ ] **Step 1: Atlas bileşenini yaz**

`apps/web/src/components/RadyalAtlas.astro`:

```astro
---
import { kirisYolu } from "~/lib/graf";
import type { GrafYerlesim } from "~/lib/graf";

interface Props {
  yerlesim: GrafYerlesim;
  /** SVG <title> — ekran okuyucu bunu okur */
  baslik: string;
  /** SVG <desc> — grafiğin ne gösterdiği */
  aciklama: string;
  /** Düğüm bağlantısının önü, örn "/kavram/" */
  hrefOnEk: string;
}

const { yerlesim, baslik, aciklama, hrefOnEk } = Astro.props;
const { dugumler, kenarlar, boyut } = yerlesim;
const merkez = boyut / 2;
const dugumBySlug = new Map(dugumler.map((d) => [d.slug, d]));

/*
 * Grup rengi SVG'de sinif adiyla veriliyor, gomulu stille degil: CSP
 * style-src 'unsafe-inline' aciyor ama nitelik icinde renk yazmak temayla
 * degismeyen sabit renk demek olurdu. Sinif -> CSS degiskeni -> iki tema.
 */
const gruplar = [...new Set(dugumler.map((d) => d.grup))];
const grupSinifi = new Map(gruplar.map((g, i) => [g, `gr-${String((i % 8) + 1)}`]));
---

<figure class="atlas">
  <svg viewBox={`0 0 ${String(boyut)} ${String(boyut)}`} role="img" aria-labelledby="atlas-baslik atlas-desc">
    <title id="atlas-baslik">{baslik}</title>
    <desc id="atlas-desc">{aciklama}</desc>

    <g class="atlas-kenarlar">
      {
        kenarlar.map((k) => {
          const a = dugumBySlug.get(k.a);
          const b = dugumBySlug.get(k.b);
          if (a === undefined || b === undefined) return null;
          return (
            <path
              d={kirisYolu(a, b, merkez)}
              class={`kn kn-${k.type} ${k.origin === "computed" ? "kn-hesap" : "kn-elle"}`}
              fill="none"
            />
          );
        })
      }
    </g>

    <g class="atlas-dugumler">
      {
        dugumler.map((d) => (
          <a href={`${hrefOnEk}${d.slug}`}>
            <circle cx={d.x} cy={d.y} r={d.r} class={`dg dg-${String(d.derinlik)} ${grupSinifi.get(d.grup) ?? ""}`} />
            {d.derinlik === 0 && (
              <text x={d.x} y={d.y - d.r - 6} class="dg-etiket" text-anchor="middle">
                {d.label}
              </text>
            )}
          </a>
        ))
      }
    </g>
  </svg>
</figure>
```

- [ ] **Step 2: `kavramlar.astro`'daki sıralama hatasını gider**

`kavramlar.astro:24` şu an üst düzey kavramları ayet sayısına göre sıralıyor:

```ts
const sorted = [...roots].sort((a, b) => b.verseCount - a.verseCount);
```

Task 1'den sonra `roots` **8 üst kavramdır ve hepsinin `verseCount` değeri 0'dır** (kendi kökleri yok). Sıralama tamamen anlamsızlaşır ve grup dizilimi dosya okuma sırasına kalır — atlas her veri değişiminde başka açıda döner, tekrarlanabilir build'in görsel karşılığı bozulur.

Sıralama çocuk toplamına çevrilir:

```ts
/*
 * Ust kavramlarin kendi koku yok, verseCount'lari 0. Ayet sayisina gore
 * siralamak sekiz sifiri siralamak olurdu ve grup dizilimi dosya okuma
 * sirasina kalirdi — atlas her veri degisiminde baska acida donerdi.
 * Cocuklarin toplamina gore siralaniyor; esitlikte slug ile sabitleniyor.
 */
const toplamAyet = (slug: string): number =>
  (childrenOf.get(slug) ?? []).reduce(
    (a, c) => a + c.verseCount + (childrenOf.get(c.slug) ?? []).reduce((x, y) => x + y.verseCount, 0),
    0,
  );
const sorted = [...roots].sort(
  (a, b) => toplamAyet(b.slug) - toplamAyet(a.slug) || a.slug.localeCompare(b.slug, "tr"),
);
```

Aynı gerekçeyle `fact-row` içindeki `{totalVerses}` hesabı da değişmez (çocuklar sayılıyor, üst başlıklar 0 ekliyor) — dokunma.

- [ ] **Step 3: `kavramlar.astro`'ya atlası ekle**

Frontmatter'a ekle (liste hâlâ birincil içerik, silinmiyor):

```astro
import RadyalAtlas from "~/components/RadyalAtlas.astro";
import { radyalYerlesim } from "~/lib/graf";
import type { RadyalGrup, RadyalKenar } from "~/lib/graf";

const gruplar: RadyalGrup[] = sorted.map((ust) => ({
  slug: ust.slug,
  label: ust.nameTr,
  cocuklar: (childrenOf.get(ust.slug) ?? []).map((c) => ({
    slug: c.slug,
    label: c.nameTr,
    agirlik: c.verseCount,
    altlar: (childrenOf.get(c.slug) ?? []).map((a) => ({
      slug: a.slug, label: a.nameTr, agirlik: a.verseCount,
    })),
  })),
}));

/*
 * Atlas cizim butcesi — spec B.2, `origin` sutunu eklendikten SONRA olculdu.
 *
 * curated 117 cift (contrast 25, cause 12, part_of 14, co_occurrence 66) HEP
 * cizilir: insan karari istatistige feda edilmez. Hesaplanandan yalnizca
 * agirlik 3 (8 cift) girer; agirlik 2 (125) ve 1 (293) atlasi sac yumagina
 * cevirirdi, onlar grup sayfasinda ve ego-grafta.
 *
 * Toplam 125 kenar / 109 dugum, iki gorsel katman:
 *   belirgin  contrast + cause + part_of        51 cift  (anlamsal bag)
 *   soluk     curated co_occurrence + w3        74 cift  (birlikte gecis)
 *
 * DIKKAT: ilk plan taslagi curated'i 51 saniyordu — o rakam yalnizca
 * contrast+cause+part_of toplamiydi, 66 elle yazilmis co_occurrence'i
 * atliyordu. Gercek 117.
 */
const gorulen = new Set<string>();
const kenarlar: RadyalKenar[] = [];
for (const c of concepts) {
  for (const r of c.relations) {
    const cizilir = r.origin === "curated" || r.weight === 3;
    if (!cizilir) continue;
    const anahtar = [c.slug, r.slug].sort().join("|") + "#" + r.type;
    if (gorulen.has(anahtar)) continue;
    gorulen.add(anahtar);
    kenarlar.push({ a: c.slug, b: r.slug, type: r.type, weight: r.weight, origin: r.origin });
  }
}

const yerlesim = radyalYerlesim({ boyut: 900, gruplar, kenarlar });
```

`<header>` bloğunun hemen ardına, mevcut `<ol class="concept-grid">` listesinin **üstüne**:

```astro
    <RadyalAtlas
      yerlesim={yerlesim}
      baslik="Kavram atlası"
      aciklama={`${String(concepts.length)} kavram, ${String(gruplar.length)} üst başlık altında; çemberin içinden geçen çizgiler kavramlar arası bağlardır. Aynı veri aşağıda liste hâlinde de var.`}
      hrefOnEk="/kavram/"
    />
    <p class="atlas-not">
      Bu bölümleme platform derlemesidir; kavramların kendisi ve ayet bağları
      kök verisinden hesaplanır. Grafiği okuyamıyorsanız aynı veri aşağıda
      liste hâlindedir.
    </p>
```

Ayrıca `fact-row` içindeki `{roots.length} üst kavram` sayısı artık 8 gösterecek — doğru, dokunma.

- [ ] **Step 4: Grup sayfasını yaz**

`apps/web/src/pages/kavram/grup/[slug].astro`: `getStaticPaths` üst kavramları (`parentSlug === null`) döndürür; sayfa grubun tanımını, kendi alt grafiğini (yalnızca o grubun çocukları + aralarındaki tüm bağlar, ağırlık 2 dahil) ve tam listesini basar. Breadcrumb: `Ana sayfa › Anla › Kavramlar › <grup>`.

- [ ] **Step 5: CSS'i yaz**

`global.css` sonuna: `.atlas svg { width: 100%; height: auto; }`, kenar sınıfları (`.kn-contrast` belirgin, `.kn-co_occurrence` soluk, `.kn-hesap` kesikli `stroke-dasharray`), düğüm sınıfları, sekiz grup rengi (`--gr-1` … `--gr-8`, iki temada da tanımlı), ve **küçük ekranda atlası gizleyip listeyi birincil bırakan** kural:

```css
@media (max-width: 48rem) {
  .atlas { display: none; }
}
```

`.kn-hesap` kesikli çizgi, `.kn-elle` düz çizgi — hesaplanan bağ **görsel olarak da** ayrı; renk tek başına anlam taşımıyor.

- [ ] **Step 6: Grup sayfalarını sitemap'e ekle**

`sitemap.xml.ts` içinde kavram döngüsünün yanına:

```ts
  for (const concept of getConceptsIndex()) {
    if (concept.parentSlug === null) {
      urls.push({ loc: `/kavram/grup/${concept.slug}`, priority: "0.7" });
    }
  }
```

- [ ] **Step 7: Derle ve doğrula**

```bash
cd /opt/kuran && pnpm build
cd apps/web/dist
grep -c '<script' kavramlar.html                 # 0
grep -c '<svg' kavramlar.html                    # 1
grep -o '<path class="kn' kavramlar.html | wc -l # ~78
ls kavram/grup/ | wc -l                          # 8
```

- [ ] **Step 8: Commit**

```bash
cd /opt/kuran
git add apps/web/src/components/RadyalAtlas.astro apps/web/src/pages/kavramlar.astro \
        apps/web/src/pages/kavram/grup apps/web/src/styles/global.css apps/web/src/pages/sitemap.xml.ts
git commit -m "feat(kavram): radyal atlas ve 8 grup sayfasi

Atlas cizim butcesi olculen sayilarla sabit: elle yazilmis 51 bag hep
cizilir, hesaplanandan yalnizca agirlik 3 (27 cift) girer. Agirlik 1 ve 2
(465 cift) atlasi sac yumagina cevirirdi; onlar grup sayfasinda ve
ego-grafta.

Hesaplanan bag kesikli, elle yazilan duz - renk tek basina anlam tasimiyor.
48rem altinda atlas gizleniyor, liste birincil icerik olarak kaliyor.

Betik yok: SVG inline, CSP'ye dokunulmadi.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Kavram sayfasında ego-graf

**Files:**
- Modify: `apps/web/src/pages/kavram/[slug].astro`

**Interfaces:**
- Consumes: `radyalYerlesim`, `RadyalAtlas` (Task 4-5)
- Produces: yok (son görev)

- [ ] **Step 1: Ego yerleşimini kur**

Kavram merkezde, en güçlü 6 komşusu tek halkada. `radyalYerlesim` yeniden kullanılır: merkezdeki kavram tek elemanlı bir "grup", komşular onun çocukları.

```astro
const komsular = concept.relations.slice(0, 6);
const egoYerlesim = radyalYerlesim({
  boyut: 420,
  gruplar: [{
    slug: concept.slug,
    label: concept.nameTr,
    cocuklar: komsular.map((r) => ({ slug: r.slug, label: r.nameTr, agirlik: r.weight * 10 })),
  }],
  kenarlar: komsular.map((r) => ({
    a: concept.slug, b: r.slug, type: r.type, weight: r.weight, origin: r.origin,
  })),
});
```

- [ ] **Step 2: Sayfaya bas**

Mevcut ilişkiler listesinin **üstüne** `<RadyalAtlas>` bileşenini `boyut=420` yerleşimiyle koy. Liste silinmez — grafik onun özeti.

- [ ] **Step 3: Derle ve ölç**

```bash
cd /opt/kuran && pnpm build
grep -c '<svg' apps/web/dist/kavram/adalet.html      # 1
grep -c '<script' apps/web/dist/kavram/adalet.html   # 0
du -sh apps/web/dist/kavram                          # onceki degerle karsilastir
```

109 kavram sayfasının her birine SVG eklendi; dizin boyutu artışını not et. %10'u aşarsa ego-grafı yalnızca ilişkisi 3'ten çok olan kavramlarda bas.

- [ ] **Step 4: Tam zincir ve commit**

```bash
cd /opt/kuran && pnpm typecheck && pnpm --filter @kuran/web test:smoke && pnpm build && pnpm lint:refs
git add apps/web/src/pages/kavram/\[slug\].astro
git commit -m "feat(kavram): kavram sayfasina ego-graf

Kavram merkezde, en guclu 6 komsusu tek halkada. Atlas yerlesimi yeniden
kullaniliyor: merkezdeki kavram tek elemanli bir grup, komsular onun
cocuklari. Iliski listesi silinmedi - grafik onun ozeti.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Doğrulama özeti

| Denetim | Komut | Beklenen |
|---|---|---|
| Taksonomi tam | `node -e` (Task 1 Step 5) | 109 kavram, 8 üst başlık, derinlik `{0:8, 1:99, 2:2}` |
| Bağ kaynağı ayrımı | Task 2 Step 7 | `curated` + `computed` ikisi de dolu |
| Dizin ilişkisi | Task 3 Step 3 | kavram başına ≤6 |
| Yerleşim determinizmi | `pnpm --filter @kuran/web test:smoke` | tüm testler geçer |
| Betik sızmamış | `grep -c '<script' apps/web/dist/kavramlar.html` | `0` |
| Atlas kenar sayısı | `grep -o '<path class="kn' … \| wc -l` | ~78 |
| Grup sayfaları | `ls apps/web/dist/kavram/grup/ \| wc -l` | `8` |
| Referans linteri | `pnpm lint:refs` | hata yok |
