import { activeWordIndex } from "./timeline";

/**
 * Dinleme sayfasi adasi — plan 04, Gorev 6.
 *
 * ## Neden requestAnimationFrame, neden timeupdate degil
 *
 * `timeupdate` saniyede ~4 kez tetikleniyor; kelimeler 300-800 ms suruyor,
 * isik gorunur sekilde gec yanardi. rAF ekran yenilemesine baglanir ve sekme
 * arka plana dustugunde tarayici kendisi durdurur.
 *
 * ## Neden tek <audio>
 *
 * Ayet basina ayri etiket, sure boyunca surekli calmayi imkansiz kiliyordu
 * (BACKLOG "sure boyunca surekli calma yok"). Tek etiketin `src`i degisiyor.
 *
 * ## Betik calismazsa
 *
 * Bu dosya hic calismaz; ayet basina duran `<audio controls>` etiketleri
 * gorunur kalir ve calisir. Ada acildiginda govdeye `dinle-js` sinifi konur,
 * yedek oynaticilar CSS ile gizlenir.
 */

interface IslandVerse {
  key: string;
  url: string | null;
  starts: number[] | null;
}

interface IslandData {
  surahId: number;
  reciterSlug: string | null;
  verses: IslandVerse[];
}

function readData(): IslandData | null {
  const node = document.getElementById("dinle-veri");
  if (!node?.textContent) return null;
  try {
    return JSON.parse(node.textContent) as IslandData;
  } catch {
    return null;
  }
}

function start(playable: IslandVerse[], bar: HTMLElement): void {
  const audio = new Audio();
  audio.preload = "none";

  const found = {
    play: document.getElementById("dinle-oynat") as HTMLButtonElement | null,
    prev: document.getElementById("dinle-geri") as HTMLButtonElement | null,
    next: document.getElementById("dinle-ileri") as HTMLButtonElement | null,
    speed: document.getElementById("dinle-hiz") as HTMLSelectElement | null,
    repeat: document.getElementById("dinle-tekrar") as HTMLInputElement | null,
    follow: document.getElementById("dinle-kaydir") as HTMLInputElement | null,
    status: document.getElementById("dinle-durum"),
  };
  if (
    !found.play ||
    !found.prev ||
    !found.next ||
    !found.speed ||
    !found.repeat ||
    !found.follow ||
    !found.status
  ) {
    return;
  }
  // Daraltilmis tipler burada sabitleniyor: asagidaki islevler hoist edildigi
  // icin TypeScript yukaridaki kontrolu onlarin icinde hatirlamiyor.
  const playButton = found.play;
  const prevButton = found.prev;
  const nextButton = found.next;
  const speed = found.speed;
  const repeat = found.repeat;
  const follow = found.follow;
  const status = found.status;

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  let current = 0;
  let activeVerseNode: HTMLElement | null = null;
  let activeWordNode: HTMLElement | null = null;
  let frame = 0;

  function verseNode(key: string): HTMLElement | null {
    return document.querySelector<HTMLElement>(`[data-verse="${key}"]`);
  }

  function clearWord(): void {
    activeWordNode?.classList.remove("is-active");
    activeWordNode = null;
  }

  function setVerse(index: number, autoplay: boolean): void {
    current = Math.max(0, Math.min(index, playable.length - 1));
    const verse = playable[current];
    if (!verse) return;
    clearWord();
    activeVerseNode?.classList.remove("is-playing");
    activeVerseNode = verseNode(verse.key);
    activeVerseNode?.classList.add("is-playing");
    status.textContent = `${verse.key} çalıyor`;
    if (verse.url !== null) audio.src = verse.url;
    audio.playbackRate = Number(speed.value);
    if (follow.checked && activeVerseNode) {
      activeVerseNode.scrollIntoView({
        block: "center",
        behavior: reduceMotion ? "auto" : "smooth",
      });
    }
    if (autoplay) void audio.play();
  }

  function tick(): void {
    const verse = playable[current];
    if (verse?.starts && activeVerseNode) {
      const index = activeWordIndex(verse.starts, audio.currentTime * 1000);
      if (index >= 0) {
        const node = activeVerseNode.querySelector<HTMLElement>(
          `.dinle-kelime[data-i="${String(index)}"]`,
        );
        if (node !== activeWordNode) {
          clearWord();
          node?.classList.add("is-active");
          activeWordNode = node;
        }
      } else {
        clearWord();
      }
    }
    frame = requestAnimationFrame(tick);
  }

  audio.addEventListener("play", () => {
    playButton.textContent = "Duraklat";
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(tick);
  });
  audio.addEventListener("pause", () => {
    playButton.textContent = "Oynat";
    cancelAnimationFrame(frame);
  });
  audio.addEventListener("ended", () => {
    clearWord();
    if (repeat.checked) {
      audio.currentTime = 0;
      void audio.play();
      return;
    }
    if (current + 1 < playable.length) setVerse(current + 1, true);
    else {
      activeVerseNode?.classList.remove("is-playing");
      status.textContent = "Sure bitti";
    }
  });
  audio.addEventListener("error", () => {
    // Sessiz kirilma olmasin: hangi ayetin calmadigi yazilir.
    status.textContent = `${playable[current]?.key ?? ""} çalınamadı`;
  });

  playButton.addEventListener("click", () => {
    if (audio.paused) {
      if (audio.src === "") setVerse(current, true);
      else void audio.play();
    } else audio.pause();
  });
  prevButton.addEventListener("click", () => {
    setVerse(current - 1, !audio.paused);
  });
  nextButton.addEventListener("click", () => {
    setVerse(current + 1, !audio.paused);
  });
  speed.addEventListener("change", () => {
    audio.playbackRate = Number(speed.value);
  });

  // Ayete tiklayinca oradan baslar.
  for (const [index, verse] of playable.entries()) {
    verseNode(verse.key)?.addEventListener("click", (event) => {
      if ((event.target as HTMLElement).closest("a, audio, button, label, select")) return;
      setVerse(index, true);
    });
  }

  // /dinle/2#ayet-2-255 ile derin bag.
  const hash = window.location.hash.replace("#ayet-", "").replace("-", ":");
  const deep = playable.findIndex((v) => v.key === hash);
  setVerse(deep >= 0 ? deep : 0, false);

  bar.hidden = false;
  document.body.classList.add("dinle-js");
}

const data = readData();
const bar = document.getElementById("dinle-cubuk");
if (data && bar) {
  const playable = data.verses.filter((v) => v.url !== null);
  if (playable.length > 0) start(playable, bar);
}
