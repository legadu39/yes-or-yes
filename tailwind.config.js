/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        ruby: {
          light: '#D24D57',
          DEFAULT: '#9B1B30', // Rouge profond
          dark: '#6A0F20',
        },
        rose: {
          pale: '#FADADD', // Rose poudré très clair
          gold: '#B76E79',  // Or rose pour les bordures
        },
        cream: '#FFFDD0',   // Blanc cassé pour le texte
      },
      fontFamily: {
        sans: ['"Lora"', 'serif'],       // Pour le corps de texte, très lisible et élégant
        script: ['"Pinyon Script"', 'cursive'], // Pour les titres, très sophistiqué
      },
      backgroundImage: {
        'romantic-gradient': 'radial-gradient(circle at top left, #9B1B30, #6A0F20, #2C050D)',
        'ruby-glow': 'linear-gradient(135deg, #D24D57 0%, #9B1B30 100%)',
      },
      boxShadow: {
        'soft-glow': '0 10px 30px -10px rgba(155, 27, 48, 0.5)',
        'rosegold': '0 0 15px rgba(183, 110, 121, 0.3)',
      },
      animation: {
        'pulse-slow': 'pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'float': 'float 6s ease-in-out infinite',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' },
        }
      }
    },
  },
  plugins: [],
}