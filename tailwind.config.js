/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#e6f3f2',
          100: '#cce6e5',
          200: '#99cdcc',
          300: '#66b4b2',
          400: '#339b99',
          500: '#006b68', // Primary requested by user
          600: '#005b58',
          700: '#004a48',
          800: '#003a38',
          900: '#002928',
          950: '#001716',
        },
        primary: {
          DEFAULT: '#006b68',
          hover: '#005553',
          light: '#e6f2f2',
          surface: '#f0f7f7',
        },
        // Operational status ramp. Findings are read at a glance in long lists,
        // so each state owns a text/surface/border triple instead of borrowing
        // an arbitrary step from the generic palette.
        risk: { DEFAULT: '#b42318', surface: '#fef3f2', border: '#fecdca', solid: '#d92d20' },
        warn: { DEFAULT: '#b54708', surface: '#fffaeb', border: '#fedf89' },
        ok: { DEFAULT: '#067647', surface: '#ecfdf3', border: '#abefc6' },
        info: { DEFAULT: '#175cd3', surface: '#eff8ff', border: '#b2ddff' },
        idle: { DEFAULT: '#475467', surface: '#f8fafc', border: '#e2e8f0' },
        canvas: '#f1f5f5',
        rule: '#e3ebeb',
      },
      fontFamily: {
        roboto: ['Roboto', 'sans-serif'],
      },
      boxShadow: {
        // Tinted rather than neutral black: the canvas is a cool teal-grey, and
        // a pure black shadow on it reads as dirt.
        'brand': '0 4px 20px -2px rgba(0, 107, 104, 0.12)',
        'brand-lg': '0 10px 25px -3px rgba(0, 107, 104, 0.18)',
        'panel': '0 1px 2px rgba(15, 47, 46, 0.04), 0 1px 3px rgba(15, 47, 46, 0.06)',
        'raised': '0 2px 4px -1px rgba(15, 47, 46, 0.06), 0 8px 16px -6px rgba(15, 47, 46, 0.12)',
      }
    },
  },
  plugins: [],
}
