export default {
  content: [
    './11ty/**/*.{html,njk,md}',
    './src/**/*.{ts,tsx,jsx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: '#3B82F6',
        secondary: '#10B981',
        accent: '#F59E0B',
      },
      spacing: {
        'safe-top': 'max(1rem, env(safe-area-inset-top))',
        'safe-bottom': 'max(1rem, env(safe-area-inset-bottom))',
      },
    },
  },
  plugins: [],
  corePlugins: {
    preflight: true,
  },
}
