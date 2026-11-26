/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      aspectRatio: {
        card: '5 / 7',
      },
      boxShadow: {
        card: '0 4px 12px -2px rgba(0, 0, 0, 0.45), 0 2px 4px -1px rgba(0, 0, 0, 0.3)',
        'card-lifted': '0 18px 34px -6px rgba(0, 0, 0, 0.6), 0 8px 14px -4px rgba(0, 0, 0, 0.4)',
      },
    },
  },
  plugins: [],
};
