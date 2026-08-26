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
        }
      },
      fontFamily: {
        roboto: ['Roboto', 'sans-serif'],
      },
      boxShadow: {
        'brand': '0 4px 20px -2px rgba(0, 107, 104, 0.12)',
        'brand-lg': '0 10px 25px -3px rgba(0, 107, 104, 0.18)',
      }
    },
  },
  plugins: [],
}
