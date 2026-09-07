import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        edge: {
          strong: "#16a34a",
          mid: "#65a30d",
          weak: "#ca8a04",
        },
      },
    },
  },
  plugins: [],
};

export default config;
