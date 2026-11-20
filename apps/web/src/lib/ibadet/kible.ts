export const KABE = { enlem: 21.4225, boylam: 39.8262 } as const;

/** Büyük daire başlangıç açısı: kuzeyden saat yönünde derece, [0,360). */
export function kibleAcisi(enlem: number, boylam: number): number {
  const rad = Math.PI / 180;
  const f1 = enlem * rad;
  const f2 = KABE.enlem * rad;
  const dl = (KABE.boylam - boylam) * rad;
  const y = Math.sin(dl) * Math.cos(f2);
  const x = Math.cos(f1) * Math.sin(f2) - Math.sin(f1) * Math.cos(f2) * Math.cos(dl);
  return ((Math.atan2(y, x) / rad) + 360) % 360;
}
