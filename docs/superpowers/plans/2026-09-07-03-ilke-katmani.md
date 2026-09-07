# İlke Katmanı — Uygulama Planı (3/3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 60 düz ilkeyi 7 alana gruplamak, ibadet ilkelerini eklemek, emir/nehiy çiftlerini kurmak ve Kur'an'dan yeni ilke adaylarını çıkaran bir tarama raporu üretmek.

**Architecture:** Kavramın aksine ilkede hiyerarşi alanı yok; bu yüzden tam şema zinciri (girdi şeması → tablo → import → build → çıktı şeması → sayfa) dolaşılır. Aday tarama scripti `data/` altına hiçbir şey yazmaz — yalnızca rapor üretir, kararı kullanıcı verir.

**Tech Stack:** PostgreSQL, Zod, TypeScript, Astro 5, inline SVG.

**Spec:** `docs/superpowers/specs/2026-09-07-menu-kavram-ilke-design.md` (Bölüm C)

## Global Constraints

- **Platform kendi ilkesini icat etmez** (`CLAUDE.md` kural 4). Her ilke en az bir `primary` dayanak ayeti ve en az bir kaynak taşır — `principleInput` bunu zaten dayatıyor.
- **Tarama scripti ilke YAZMAZ.** `data/` altına dosya koymaz; çıktısı `reports/` altında bir rapordur.
- **JS eklenmez, CSP değişmez.**
- **Tekrarlanabilir build** (plan §20.1).
- `principle."order"` **UNIQUE** ve `> 0`. Yeni ilkeler 61'den devam eder; mevcut 1–60 numaralandırması değişmez.
- Bot takvimi `usable.length` ile dönüyor (`scripts/build/lib/content.ts:602`), 60 sabit değil — ilke eklemek takvimi kaydırır ama kırmaz.
- Ölçülen mevcut durum: 60 ilke, `oppositeSlug` 4 dolu, `dailyNote` 0 dolu, ortalama 5.5 ayet, 60/60 ilkenin kavram bağı var.

---

### Task 1: Alan katmanı — şema zinciri

**Files:**
- Create: `data/principle_areas/area_allaha-karsi.json` ve 6 kardeşi
- Modify: `packages/schema/src/content_input.ts` (`principleAreaInput`, `principleInput.areaSlug`)
- Modify: `infra/db/schema.sql` (`principle_area` tablosu, `principle.area_id`)
- Modify: `scripts/import/content.ts` (`CONTENT_TABLES`, yükleme, insert, denetim)
- Modify: 60 mevcut `data/principles/principle_*.json` (`areaSlug`)

**Interfaces:**
- Consumes: yok
- Produces: `principleAreaInput`; `PrincipleInput.areaSlug: string`; `principle_area` tablosu

- [ ] **Step 1: Yedi alan dosyasını yaz**

`data/principle_areas/area_allaha-karsi.json` — tam örnek:

```json
{
  "slug": "allaha-karsi",
  "nameTr": "Allah'a karşı",
  "nameAr": "حقوق الله",
  "definition": "Kulun doğrudan Rabbine karşı sorumluluklarını düzenleyen ilkeler: takva, şükür, tevbe, tevekkül ve duanın kesilmemesi.",
  "order": 1,
  "sourceSlugs": ["tdv-islam-ansiklopedisi"]
}
```

Kalan altısı:

| slug | nameTr | order |
|---|---|---|
| `ibadet` | İbadet | 2 |
| `nefis-terbiyesi` | Nefis terbiyesi | 3 |
| `soz-ve-dogruluk` | Söz ve doğruluk | 4 |
| `aile-ve-yakinlar` | Aile ve yakınlar | 5 |
| `mal-ve-iktisat` | Mal ve iktisat | 6 |
| `toplum-ve-yonetim` | Toplum ve yönetim | 7 |

- [ ] **Step 2: Girdi şemasını genişlet**

`packages/schema/src/content_input.ts`, `principleInput`'un hemen üstüne:

```ts
/**
 * İlke alanı — plan dışı ek katman (2026-09-07).
 *
 * 60 ilke düz listeydi; hangi alana ait olduğu görünmüyordu. Kavramın
 * aksine ilkede hiyerarşi alanı yoktu, bu yüzden ayrı tablo gerekti.
 */
export const principleAreaInput = z.object({
  slug,
  nameTr: nonEmptyText,
  nameAr: z.string().nullable(),
  definition: nonEmptyText,
  order: z.number().int().positive(),
  sourceSlugs: slugList.min(1, "ilke alani kaynaksiz olamaz"),
});
export type PrincipleAreaInput = z.infer<typeof principleAreaInput>;
```

`principleInput` nesnesine, `order`'ın hemen ardına:

```ts
    /** principle_area.slug — zorunlu: alansız ilke listede kaybolurdu */
    areaSlug: slug,
```

- [ ] **Step 3: Tabloyu ekle**

`infra/db/schema.sql`, `CREATE TABLE principle` bloğunun **üstüne**:

```sql
-- İlke alanı (2026-09-07). 60 ilke düz listeydi; alan katmanı olmadan
-- "Allah'a karşı" ile "mal ve iktisat" ilkeleri aynı ızgarada karışıyordu.
CREATE TABLE principle_area (
  id          integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  slug        text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name_tr     text NOT NULL,
  name_ar     text,
  definition  text NOT NULL,
  "order"     smallint NOT NULL UNIQUE CHECK ("order" > 0)
);

CREATE TABLE principle_area_source (
  principle_area_id integer NOT NULL REFERENCES principle_area (id) ON DELETE CASCADE,
  source_id         integer NOT NULL REFERENCES source (id),
  PRIMARY KEY (principle_area_id, source_id)
);
```

`principle` tablosuna sütun — `"order"` satırının üstüne:

```sql
  area_id                integer NOT NULL REFERENCES principle_area (id),
```

- [ ] **Step 4: Import'u bağla**

`scripts/import/content.ts`:

`CONTENT_TABLES` dizisinde `principle` satırını değiştir — alan tabloları **önce** gelmeli (FK ve TRUNCATE CASCADE sırası):

```ts
  "principle_area", "principle_area_source",
  "principle", "principle_source", "principle_verse", "principle_story", "principle_concept",
```

Yükleme (satır ~174 civarındaki ilke döngüsünün yanına):

```ts
  const principleAreas: PrincipleAreaInput[] = [];
  for (const path of listPrefixed("principle_areas", "area")) {
    const area = parseWith(principleAreaInput, readJson(path), path);
    if (area === undefined) continue;
    if (!path.endsWith(`area_${area.slug}.json`)) {
      parseErrors.push(`${relative(repoRoot, path)}: dosya adi area_${area.slug}.json olmali`);
    }
    principleAreas.push(area);
  }
```

`loadAll` dönüş nesnesine ve `LoadedData` arayüzüne `principleAreas` ekle.

Denetim (kavram denetimlerinin yanında):

```ts
  const areaSlugs = uniq("ilke alani", data.principleAreas.map((a) => a.slug));
  for (const p of data.principles) {
    need(`ilke ${p.slug}`, areaSlugs, "alan", [p.areaSlug]);
  }
```

Insert — `principleId` insert'ünün **üstüne**:

```ts
    const areaId = await insertReturning(
      client,
      "principle_area",
      ["slug", "name_tr", "name_ar", "definition", "order"],
      data.principleAreas.map((a) => [a.slug, a.nameTr, a.nameAr, a.definition, a.order]),
      "slug",
    );
    await insertPlain(
      client,
      "principle_area_source",
      ["principle_area_id", "source_id"],
      data.principleAreas.flatMap((a) => [...new Set(a.sourceSlugs)].map((s) => [areaId.get(a.slug), sid(s)])),
    );
```

`principle` insert'ünün sütun listesine ve değerlerine `area_id` ekle:

```ts
      ["slug", "name_tr", "name_ar", "root_id", "area_id", "definition", "explanation", "daily_note", "opposite_principle_id", "order"],
      data.principles.map((p) => [
        p.slug, p.nameTr, p.nameAr, p.rootLatin === null ? null : rootIdByLatin.get(p.rootLatin),
        areaId.get(p.areaSlug),
        p.definition, p.explanation, p.dailyNote, null, p.order,
      ]),
```

- [ ] **Step 5: 60 ilkeye `areaSlug` yaz**

```bash
cd /opt/kuran && node -e '
const fs = require("fs");
const M = {
  "allaha-karsi": ["takva","sukur","zikir","dua","tevbe","tevekkul","umit-kesmeme"],
  "nefis-terbiyesi": ["sabir","iffet","tevazu","ofkeyi-yutma","israftan-kacinma","kibirden-kacinma","temizlik"],
  "soz-ve-dogruluk": ["dogruluk","guzel-soz","yalandan-kacinma","giybetten-kacinma","iftiradan-kacinma","zandan-kacinma","tecessusten-kacinma","alay-etmeme","bilmedigini-soylememe","sozunde-durma","yemine-baglilik","haberi-arastirma","hakki-gizlememe","selamlasma"],
  "aile-ve-yakinlar": ["anne-babaya-iyilik","akrabaya-iyilik","eslere-iyi-davranma","cocuklari-oldurmeme","yetimi-gozetme","yetim-malini-koruma","komsu-hakki","ev-mahremiyeti"],
  "mal-ve-iktisat": ["infak","gizli-sadaka","faizden-kacinma","haksiz-kazanctan-kacinma","olcude-durustluk","borcu-yazma","borcluya-muhlet","cimrilikten-kacinma","koleyi-azat","yolcuya-hak","basa-kakmama"],
  "toplum-ve-yonetim": ["adalet","adaletle-hukmetme","emanete-sadakat","istisare","iyiligi-emretme","baris-ve-uzlasma","savasta-olcululuk","esire-iyilik","dinde-zorlama-yok","ilim-ogrenme","hayirda-yarisma","affetme","ihsan"],
};
const areaOf = {};
for (const [a, list] of Object.entries(M)) for (const s of list) areaOf[s] = a;
let yazildi = 0;
for (const f of fs.readdirSync("data/principles")) {
  if (!f.endsWith(".json")) continue;
  const p = "data/principles/" + f;
  const j = JSON.parse(fs.readFileSync(p, "utf8"));
  const area = areaOf[j.slug];
  if (!area) { console.error("ESLEME YOK:", j.slug); process.exitCode = 1; continue; }
  j.areaSlug = area;
  fs.writeFileSync(p, JSON.stringify(j, null, 2) + "\n");
  yazildi++;
}
console.log("yazildi:", yazildi);
'
```

Beklenen: `yazildi: 60`, "ESLEME YOK" satırı yok. Çıkarsa **dur**.

- [ ] **Step 6: Veritabanını yeniden kur ve içe aktar**

Şema değişti; `content:import` sütun eklemez.

```bash
cd /opt/kuran && docker compose -f infra/db/docker-compose.yml down -v && docker compose -f infra/db/docker-compose.yml up -d
sleep 5 && pnpm content:import
```

- [ ] **Step 7: Commit**

```bash
cd /opt/kuran
git add data/principle_areas data/principles packages/schema/src/content_input.ts \
        infra/db/schema.sql scripts/import/content.ts
git commit -m "feat(ilke): 7 alanli kategori katmani

60 ilke duz listeydi; 'Allah'a karsi' ile 'mal ve iktisat' ilkeleri ayni
izgarada karisiyordu. Kavramin aksine ilkede hiyerarsi alani yoktu, bu
yuzden ayri tablo gerekti.

area_id NOT NULL: alansiz ilke listede kaybolurdu. 60 esleme ayni commit'te
giriyor, import atomik (TRUNCATE + yeniden yazim) - yarim durum olusmuyor.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Alanı dışa aktar ve sayfada göster

**Files:**
- Modify: `packages/schema/src/static_content.ts` (`staticPrinciple.area`, index `areaSlug`)
- Modify: `scripts/build/lib/content.ts` (sorgu + dışa aktarım + `principle_areas.json`)
- Modify: `apps/web/src/lib/data.ts` (`getPrincipleAreas`)
- Modify: `apps/web/src/pages/ilkeler.astro` (alan gruplaması)
- Modify: `apps/web/src/pages/ilke/[slug].astro` (alan rozeti + breadcrumb)

**Interfaces:**
- Consumes: `principle_area` tablosu (Task 1)
- Produces: `StaticPrincipleAreas` (`principle_areas.json`); `getPrincipleAreas()`

- [ ] **Step 1: Çıktı şemalarını genişlet**

`packages/schema/src/static_content.ts`:

```ts
export const staticPrincipleAreas = z.object({
  areas: z
    .array(
      z.object({
        slug,
        nameTr: nonEmptyText,
        nameAr: z.string().nullable(),
        definition: nonEmptyText,
        order: z.number().int().positive(),
        principleCount: z.number().int().nonnegative(),
      }),
    )
    .min(1),
});
export type StaticPrincipleAreas = z.infer<typeof staticPrincipleAreas>;
```

`staticPrinciple` nesnesine `area: namedSlug,` ekle.
`staticPrinciplesIndex.principles[]` nesnesine `areaSlug: slug,` ekle.

- [ ] **Step 2: Build'de doldur**

`scripts/build/lib/content.ts` içinde ilke sorgusunun yanına alan sorgusu ekle, `staticPrinciple` payload'ına `area`, index push'una `areaSlug` ekle, ve `principle_areas.json`'ı yaz (`principleCount` her alanın ilke sayısı).

- [ ] **Step 3: Web veri katmanına ekle**

`apps/web/src/lib/data.ts`:

```ts
export const getPrincipleAreas = once(() =>
  readJson<StaticPrincipleAreas>("principle_areas.json").areas,
);
```

- [ ] **Step 4: `ilkeler.astro`'yu alanlara göre grupla**

Mevcut düz `<ol class="principle-grid">` yerine alan başına bir `<section>`: alan başlığı, tanımı, ve o alanın ilke kartları. Alanlar `order`'a göre sıralı. `fact-row`'a `{areas.length} alan` satırı eklenir.

- [ ] **Step 5: İlke sayfasına alan rozeti**

`ilke/[slug].astro` breadcrumb'ı: `Ana sayfa › Anla › İlkeler › <ilke>`; kicker alan adını taşır.

- [ ] **Step 6: Derle, doğrula, commit**

```bash
cd /opt/kuran && pnpm build:data && pnpm --filter @kuran/web build
node -e '
const a=require("./apps/web/public/data/principle_areas.json");
console.log("alan:",a.areas.length,"| toplam ilke:",a.areas.reduce((s,x)=>s+x.principleCount,0));
console.log(a.areas.map(x=>x.slug+":"+x.principleCount).join(" "));'
```

Beklenen: `alan: 7 | toplam ilke: 60`, `ibadet:0` (Task 3'te dolacak).

```bash
git add packages/schema/src/static_content.ts scripts/build/lib/content.ts \
        apps/web/src/lib/data.ts apps/web/src/pages/ilkeler.astro apps/web/src/pages/ilke
git commit -m "feat(ilke): alanlar disa aktariliyor ve sayfada gruplaniyor

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: İbadet ilkeleri

**Files:**
- Create: `data/principles/principle_namaz.json`, `principle_oruc.json`, `principle_zekat.json`, `principle_hac.json`
- Modify: `docs/DURUM.md` (takvim sayıları)

**Interfaces:**
- Consumes: `ibadet` alanı (Task 1)
- Produces: 4 yeni ilke slug'ı; `order` 61–64

- [ ] **Step 1: Dört ilke dosyasını yaz**

Her biri mevcut `principle_adalet.json` biçiminde; `areaSlug: "ibadet"`, `order` 61–64. Dayanak ayetleri **kaynaklı** seçilir; her birinde en az bir `primary` rol zorunlu (`principleInput` dayatıyor).

Başlangıç dayanakları (kaynak doğrulaması sırasında genişletilebilir):

| slug | nameTr | rootLatin | order | primary dayanaklar |
|---|---|---|---|---|
| `namaz` | Namaz | `SlV` | 61 | 2:43, 2:238, 4:103, 29:45 |
| `oruc` | Oruç | `Svm` | 62 | 2:183, 2:185, 2:187 |
| `zekat` | Zekât | `zkw` | 63 | 2:43, 9:60, 9:103 |
| `hac` | Hac | `Hcc` | 64 | 2:196, 3:97, 22:27 |

`rootLatin` değerlerini `roots_index.json` ile doğrula — uydurma:

```bash
cd /opt/kuran && node -e '
const r=require("./apps/web/public/data/roots_index.json").roots;
for(const l of ["SlV","Svm","zkw","Hcc"]){
  const m=r.find(x=>x.latin===l);
  console.log(l, m?("VAR "+m.arabic):"YOK — dogru anahtari roots_index.json icinde ara");
}'
```

`YOK` çıkan olursa doğru latin anahtarını `roots_index.json` içinden bul ve dosyaya onu yaz.

- [ ] **Step 2: `concepts` bağını kur**

`namaz` ilkesi `concepts: ["namaz","ibadet"]`, `zekat` → `["zekat","infak"]`, `oruc` → `["ibadet","takva"]`, `hac` → `["ibadet"]`. Bu kavramların hepsi mevcut (doğrula: `ls data/concepts/concept_{namaz,zekat,ibadet,infak,takva}.json`).

- [ ] **Step 3: İçe aktar, derle, takvimi ölç**

```bash
cd /opt/kuran && pnpm content:import && pnpm build:data
node -e '
const s=require("./apps/web/public/data/schedule.json");
const ilke=new Set(s.entries.map(e=>e.principleSlug));
const ayet=new Set(s.entries.map(e=>e.verseId));
console.log("gun:",s.entries.length,"| ilke:",ilke.size,"| farkli ayet:",ayet.size);'
```

Beklenen: `gun: 366`, `ilke: 64`, farklı ayet sayısı 239'dan farklı olacak — **not al**.

- [ ] **Step 4: `docs/DURUM.md`'yi güncelle**

"366 gün, 60 ilke dönüşümlü, 239 farklı ayet" cümlesi ve altındaki rotasyon açıklaması yeni sayılarla değişir. Abonelerin gün→ayet eşlemesinin kaydığı açıkça yazılır; bu beklenen davranıştır (takvim her build'de yeniden üretiliyor, gönderim geçmişi tutulmuyor — plan §19.2).

- [ ] **Step 5: Commit**

```bash
cd /opt/kuran
git add data/principles docs/DURUM.md
git commit -m "feat(ilke): namaz, oruc, zekat ve hac ilkeleri eklendi

Ilke listesi ahlaki emirlerle sinirliydi; ibadet ilkeleri hic yoktu.
order 61-64: mevcut 1-60 numaralandirmasi kaymadi, diff kucuk kaldi.

Bot takvimi usable.length ile donuyor, 60 sabit degil - rotasyon
kendiliginden 64'e gecti, kod degismedi. Abonelerin gun->ayet eslemesi
kaydi; takvim zaten her build'de yeniden uretiliyor ve gonderim gecmisi
tutulmuyor (plan 19.2). DURUM.md sayilari guncellendi.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Emir/nehiy çiftleri ve ilke atlası

**Files:**
- Modify: 10 `data/principles/principle_*.json` (`oppositeSlug`)
- Modify: `scripts/build/linter.ts` (karşılıklılık denetimi)
- Modify: `apps/web/src/pages/ilkeler.astro` (radyal atlas)

**Interfaces:**
- Consumes: `radyalYerlesim`, `RadyalAtlas` (Plan 2, Task 4-5)
- Produces: yok

- [ ] **Step 1: Beş çifti kur**

Yalnızca Kur'an'ın aynı bağlamda karşı karşıya koyduğu çiftler; her iki dosyaya da yazılır (karşılıklı):

| İlke | `oppositeSlug` |
|---|---|
| `dogruluk` | `yalandan-kacinma` |
| `yalandan-kacinma` | `dogruluk` |
| `infak` | `cimrilikten-kacinma` |
| `cimrilikten-kacinma` | `infak` |
| `tevazu` | `kibirden-kacinma` |
| `kibirden-kacinma` | `tevazu` |
| `guzel-soz` | `alay-etmeme` |
| `alay-etmeme` | `guzel-soz` |
| `olcude-durustluk` | `haksiz-kazanctan-kacinma` |
| `haksiz-kazanctan-kacinma` | `olcude-durustluk` |

Mevcut 4 dolu `oppositeSlug`'ın hangileri olduğunu önce oku; çakışırsa mevcut değeri **koru**, üstüne yazma:

```bash
cd /opt/kuran && node -e '
const fs=require("fs");
for(const f of fs.readdirSync("data/principles")){if(!f.endsWith(".json"))continue;
 const j=JSON.parse(fs.readFileSync("data/principles/"+f,"utf8"));
 if(j.oppositeSlug)console.log(j.slug,"->",j.oppositeSlug);}'
```

`israftan-kacinma` ile `cimrilikten-kacinma` **karşıt değildir** — aynı ölçünün iki ucudur (25:67). `oppositeSlug` kurulmaz; ilke sayfasında ayrı bir "iki uç" notu olarak gösterilir.

- [ ] **Step 2: Karşılıklılık denetimi ekle**

`scripts/build/linter.ts` içine: A'nın karşıtı B ise B'nin karşıtı da A olmalı. Tek yönlü çift build'i düşürür — yoksa ilke sayfasında bağ bir yönde görünür, diğerinde görünmez ve kimse fark etmez.

- [ ] **Step 3: İlke atlasını bas**

`ilkeler.astro`, Plan 2'nin `radyalYerlesim` ve `RadyalAtlas`'ını yeniden kullanır: 7 alan halkada, ilkeler dışta, `agirlik` = `primaryCount`. Kenarlar yalnızca emir/nehiy çiftleri (`type: "contrast"`, `origin: "curated"`) — 5 çift, seyrek ve okunur. Atlas listenin üstünde; liste birincil içerik olarak kalır. 48rem altında atlas gizlenir.

- [ ] **Step 4: Derle, doğrula, commit**

```bash
cd /opt/kuran && pnpm content:import && pnpm build && pnpm lint:refs
grep -c '<script' apps/web/dist/ilkeler.html   # 0
grep -c '<svg' apps/web/dist/ilkeler.html      # 1
```

```bash
git add data/principles scripts/build/linter.ts apps/web/src/pages/ilkeler.astro
git commit -m "feat(ilke): emir/nehiy ciftleri ve radyal ilke atlasi

oppositeSlug 60'ta 4 doluydu, 5 cift daha kuruldu - yalnizca Kur'an'in
ayni baglamda karsi karsiya koydugu ciftler. Zorlanmadi: cifti olmayan
ilkede alan null kaldi.

israftan-kacinma ile cimrilikten-kacinma cift YAPILMADI: karsit degiller,
ayni olcunun iki ucu (25:67).

Linter karsilikliligi denetliyor - tek yonlu cift ilke sayfasinda bir
yonde gorunur, diger yonde gorunmezdi ve kimse fark etmezdi.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Aday tarama raporu

**Files:**
- Create: `scripts/build/principle_candidates.ts`
- Modify: `scripts/build/package.json` (script girişi)
- Create: `reports/principle_candidates.md` (script çıktısı)

**Interfaces:**
- Consumes: `apps/web/public/data/surah/surah_<n>.json` (`textUthmani`), `principles_index.json`, `roots_index.json`
- Produces: `reports/principle_candidates.md`

- [ ] **Step 1: Normalizasyonu ve referans sayıları yaz**

Script'in ilk işi kendini doğrulamak. Ölçülen referans sayılar (6236 ayet üzerinde):

| Kalıp | Regex (normalize sonrası) | Beklenen |
|---|---|---|
| "Ey iman edenler" ile açılan | `^يا?ايها الذين امنوا` | **88** |
| "Ey insanlar" ile açılan | `^يا?ايها الناس` | **14** |
| Nehiy | `(^\|\s)(ولا\|فلا) ت` | **285** |
| "Farz kılındı" | `كتب عليكم` | **5** |

```ts
/**
 * Uthmânî imlâ normalizasyonu.
 *
 * TUZAK: hareke aralığını `ً` ile bitirmek fatha, damma, kasra, şedde,
 * sükûn (`َ`–`ْ`) ve medde (`ٓ`) işaretlerini KAÇIRIR. Bu işaretler Uthmânî
 * metinde harflerin arasına girdiği için düz kalıp eşleşmesi tutmaz ve
 * script HATA VERMEDEN sıfır sonuç döndürür. Aralık `ً-ٟ` olmalıdır.
 */
const strip = (s: string): string =>
  s.normalize("NFC")
    .replace(/[ؐ-ًؚ-ٰٟۖ-ۭـ]/g, "")
    .replace(/[آأإٱ]/g, "ا")
    .replace(/ءا/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/\s+/g, " ")
    .trim();
```

Doğrulama kapısı — sayılar tutmazsa script **durur**:

```ts
const BEKLENEN = { believers: 88, people: 14, nehiy: 285, kutibe: 5 } as const;
// ... sayımdan sonra:
for (const [ad, beklenen] of Object.entries(BEKLENEN)) {
  if (sayim[ad] !== beklenen) {
    throw new Error(
      `Normalizasyon bozuldu: ${ad} = ${String(sayim[ad])}, beklenen ${String(beklenen)}. ` +
        `Sessiz sifir sonuc bu tarama icin en gorunmez hata bicimi; rapor uretilmedi.`,
    );
  }
}
```

- [ ] **Step 2: Üç sinyali birleştir**

1. Arapça yapısal işaret (yukarıdaki dört kalıp)
2. Türkçe meal emir/nehiy kalıpları: `-ın/-iniz`, `…mayın/…meyin`, `sakının`, `kaçının`, `…ediniz` — varsayılan meal üzerinden
3. Kök kapsama farkı: bu ayetlerin kökleri 64 ilkenin `rootLatin` kümesinde geçmiyorsa aday

- [ ] **Step 3: Raporu üret**

`reports/principle_candidates.md`: aday kök (Arapça + latin), dayanak ayetler, mevcut ilkelerle örtüşme skoru, önerilen ad. Sinyal gücüne göre sıralı.

**Script `data/` altına hiçbir şey yazmaz.** Bunu dosyanın başına yorum olarak yaz.

- [ ] **Step 4: Çalıştır ve raporu oku**

```bash
cd /opt/kuran && pnpm --filter @kuran/build exec tsx principle_candidates.ts
wc -l reports/principle_candidates.md
head -40 reports/principle_candidates.md
```

Beklenen boşlukların raporda çıkıp çıkmadığını kontrol et: fesattan kaçınma, haddi aşmama, haksız yere cana kıymama, hırsızlık, zinaya yaklaşmama, içki-kumar, kötülüğü iyilikle savma (41:34), güzel cedel (16:125), yetimi azarlamama (93:9-10), fakiri doyurmaya teşvik (107:3).

- [ ] **Step 5: Commit ve kullanıcıya sun**

```bash
cd /opt/kuran
git add scripts/build/principle_candidates.ts scripts/build/package.json reports/principle_candidates.md
git commit -m "feat(ilke): Kur'an tarama aday raporu

Script ILKE YAZMAZ: data/ altina hicbir sey koymaz, yalnizca rapor uretir.
Karar kullanicinin (CLAUDE.md kural 4).

Kelime verisinde morfoloji yok - kip/POS etiketi tasimiyor. Tarama Arapca
yapisal kaliplar + Turkce meal emir/nehiy kaliplari + kok kapsama farki
uzerinden yuruyor.

Normalizasyon dogrulama kapisi: script 88/14/285/5 referans sayilarini
yeniden uretemezse duruyor. Uthmani imlada hareke araligini dar tutmak
fatha/damma/kasra/sedde/sukun isaretlerini kacirir ve tarama hata vermeden
sifir sonuc dondurur - en gorunmez hata bicimi.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 6: KULLANICI KARAR TURU — burada dur**

Raporu kullanıcıya sun. Onaylanan adaylar kaynaklarıyla elle yazılır; bu plan onay olmadan devam etmez.

---

## Doğrulama özeti

| Denetim | Komut | Beklenen |
|---|---|---|
| Alan eşlemesi tam | Task 2 Step 6 | 7 alan, 60 (sonra 64) ilke |
| Alansız ilke yok | `pnpm content:import` | hata yok (`area_id NOT NULL`) |
| Takvim sağlam | Task 3 Step 3 | 366 gün, 64 ilke |
| `oppositeSlug` karşılıklı | `pnpm lint:refs` | hata yok |
| Betik sızmamış | `grep -c '<script' apps/web/dist/ilkeler.html` | `0` |
| Tarama normalizasyonu | `tsx principle_candidates.ts` | 88/14/285/5 tutuyor |
| Tam zincir | `pnpm build` | hata yok |
