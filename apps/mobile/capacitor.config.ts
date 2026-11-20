import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "tr.kurankesfi.app",
  appName: "Kur'an-ı Kerim Keşfi",
  webDir: "www",
  server: {
    url: "https://kurankesfi.tr",
    errorPath: "offline.html",
    allowNavigation: ["kurankesfi.tr", "medya.kurankesfi.tr"],
  },
};

export default config;
