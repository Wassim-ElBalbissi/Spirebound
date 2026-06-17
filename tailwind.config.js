/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/renderer/index.html',
    './src/renderer/annotations.html',
    './src/renderer/hub.html',
    './src/renderer/src/**/*.{ts,tsx}'
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'Segoe UI', 'system-ui', 'sans-serif']
      },
      colors: {
        // Branded surface palette shared by the overlay and the Hub.
        surface: {
          950: '#0b0b0f',
          900: '#121218',
          800: '#1a1a22',
          700: '#26262f'
        },
        brand: {
          DEFAULT: '#34d399',
          accent: '#38bdf8'
        }
      }
    }
  },
  // Tier color utility classes are applied via string maps (theme/tiers.ts) and
  // in HandBadge; safelist them so JIT keeps them when purging.
  safelist: [
    {
      pattern:
        /(bg|text|border)-(fuchsia|emerald|sky|zinc|amber|rose)-(200|300|400|500)(\/(20|60))?/
    }
  ],
  plugins: []
}
