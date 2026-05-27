import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eef6ff",
          100: "#d9eaff",
          200: "#b9d8ff",
          300: "#8bbeff",
          400: "#5b9eff",
          500: "#3a82f6",
          600: "#2667e6",
          700: "#1f53c2",
          800: "#1d469a",
          900: "#1c3d7b",
        },
      },
      fontFamily: {
        sans: ['"Inter"', '"Hiragino Kaku Gothic ProN"', '"Yu Gothic UI"', "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
