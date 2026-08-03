import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Okta brand blue palette
        brand: {
          50:  '#D9DFFF',
          100: '#D9DFFF',
          500: '#9AB7F0',
          600: '#0131FF',
          700: '#001FA5',
          900: '#00033E',
        },
      },
    },
  },
  plugins: [],
};

export default config;
