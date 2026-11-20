const AY_ADLARI = [
  "Muharrem", "Safer", "Rebiülevvel", "Rebiülahir", "Cemaziyelevvel", "Cemaziyelahir",
  "Recep", "Şaban", "Ramazan", "Şevval", "Zilkade", "Zilhicce",
] as const;

export function hicriTarih(
  an: Date,
  saatDilimi: string,
): { gun: number; ay: number; yil: number; ayAdi: string; metin: string } {
  const parcalar = new Intl.DateTimeFormat("tr-TR-u-ca-islamic-umalqura", {
    timeZone: saatDilimi,
    day: "numeric",
    month: "numeric",
    year: "numeric",
  }).formatToParts(an);
  const al = (tip: string): number =>
    Number(parcalar.find((p) => p.type === tip)?.value.replace(/\D/g, "") ?? "NaN");
  const gun = al("day");
  const ay = al("month");
  const yil = al("relatedYear") || al("year");
  const ayAdi = AY_ADLARI[ay - 1] ?? "";
  return { gun, ay, yil, ayAdi, metin: `${String(gun)} ${ayAdi} ${String(yil)}` };
}
