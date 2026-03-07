import {
  Bungee_Shade,
  Italiana,
  Playfair_Display,
  Plus_Jakarta_Sans,
  Space_Grotesk,
  Special_Elite,
} from "next/font/google";

export const bungeeShade = Bungee_Shade({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
  weight: ["400"],
});

export const italiana = Italiana({
  subsets: ["latin"],
  variable: "--font-script",
  display: "swap",
  weight: ["400"],
});

export const specialElite = Special_Elite({
  subsets: ["latin"],
  variable: "--font-typewriter",
  display: "swap",
  weight: ["400"],
});

export const playfairDisplay = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-playfair",
  display: "swap",
});

export const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-plus-jakarta",
  display: "swap",
});

export const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
  display: "swap",
  weight: ["400", "500", "600", "700"],
});
