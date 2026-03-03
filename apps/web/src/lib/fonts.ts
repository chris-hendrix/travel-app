import {
  Bitter,
  Caveat,
  Nunito,
  Oswald,
  Playfair_Display,
  Plus_Jakarta_Sans,
  Righteous,
  Space_Grotesk,
} from "next/font/google";

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

export const nunito = Nunito({
  subsets: ["latin"],
  variable: "--font-nunito",
  display: "swap",
});

export const caveat = Caveat({
  subsets: ["latin"],
  variable: "--font-caveat",
  display: "swap",
});

export const oswald = Oswald({
  subsets: ["latin"],
  variable: "--font-oswald",
  display: "swap",
});

export const righteous = Righteous({
  subsets: ["latin"],
  variable: "--font-righteous",
  display: "swap",
  weight: "400",
});

export const bitter = Bitter({
  subsets: ["latin"],
  variable: "--font-bitter",
  display: "swap",
});
