# Planning Poker

Remote Planning Poker Web App for distributed software teams to run estimation sessions with real-time collaboration.

🔗 Live app: [https://wills-planning-poker.netlify.app/](https://wills-planning-poker.netlify.app/)
📦 Source: [https://github.com/will-cohen/planning-poker](https://github.com/will-cohen/planning-poker)

## Architecture

This project uses a hybrid architecture:

- **11ty (Eleventy)** - Static site generation for landing pages, documentation, and public content
- **React + Vite** - Single Page Application (SPA) for the interactive planning poker application
- **Yjs CRDT** - Conflict-free replicated data types for real-time synchronization
- **y-webrtc** - Peer-to-peer communication using WebRTC
- **IndexedDB** - Client-side persistence and offline recovery

### How It Works

1. **Static Pages** (`/`) - 11ty generates pages like home, docs, and about
2. **React App** (`/app/`) - 11ty hosts a page that loads the Vite-built React SPA
3. **Shared Styling** - Both use the same Tailwind CSS
4. **Build Process**:
   - Tailwind CSS compiles to `dist/styles.css`
   - Vite bundles React app to `dist/assets/`
   - 11ty generates HTML and includes both in final output

## Project Structure

```
planning-poker/
├── 11ty/                    # Static content (landing page, docs)
│   ├── _includes/           # Partial templates
│   ├── _layouts/            # Layout templates
│   │   ├── base.njk        # Layout for static pages
│   │   └── app.njk         # Layout for React app
│   ├── app/                 # React app host page
│   │   └── index.md        # Mounts React SPA at /app/
│   └── index.md             # Home page
├── src/                     # React application
│   ├── components/          # React components
│   ├── hooks/               # Custom React hooks
│   ├── types/               # TypeScript type definitions
│   ├── styles/              # CSS styles (Tailwind)
│   ├── utils/               # Utility functions
│   ├── App.tsx              # Root component
│   └── main.tsx             # Entry point
├── public/                  # Static assets (images, fonts, etc.)
├── index.html               # Vite app entry point (used during dev)
├── package.json             # Dependencies and scripts
├── .eleventy.js             # 11ty configuration
├── vite.config.js           # Vite configuration
├── tailwind.config.js       # Tailwind CSS configuration
├── tsconfig.json            # TypeScript configuration
└── README.md                # This file
```

## Getting Started

### Prerequisites

- Node.js 18.0.0 or higher
- npm or yarn

### Installation

1. Install dependencies:
```bash
npm install
```

### Development

Run all dev servers together:

```bash
npm run dev
```

This starts three processes:
- **Tailwind CSS watcher** - Compiles CSS to `dist/styles.css` (recompiles on changes)
- **Vite dev server** - Runs React app at `http://localhost:5173` with hot reload
- **11ty dev server** - Runs static site at `http://localhost:8080` and includes Vite bundle

Access the app at:
- **Home page**: `http://localhost:8080/` (served by 11ty)
- **Planning Poker App**: `http://localhost:8080/app/` (React SPA hosted by 11ty, loads from Vite dev server)

Or run servers separately in different terminals:

```bash
# Terminal 1: 11ty static site at http://localhost:8080
npm run dev:11ty

# Terminal 2: Vite SPA at http://localhost:5173 (dev only, loaded by 11ty in build)
npm run dev:vite

# Terminal 3: Tailwind CSS watcher
npm run dev:css
```

### Signaling Server (WebRTC)

The app uses WebRTC for peer-to-peer communication, which requires a signaling server for connection establishment. A lightweight signaling server is included in the `server/` directory.

**Quick start with Docker:**

```bash
# Start signaling server + Redis
docker-compose up
```

The signaling server will be available at `ws://localhost:4444`.

**Without Docker:**

```bash
cd server
npm install
npm start
```

See [server/README.md](./server/README.md) for detailed setup, configuration, and deployment instructions.

**Configuration:**

Update your `.env` file to point to your signaling server:

```env
VITE_SIGNALING_SERVER=ws://localhost:4444
```

For production, use the URL of your deployed signaling server (with `wss://` for secure WebSocket).

### Build

Build both static site and SPA (builds in correct order):

```bash
npm run build
```

This runs:
1. `npm run build:css` - Compile Tailwind CSS to `dist/styles.css`
2. `npm run build:vite` - Bundle React app to `dist/assets/` (generates manifest.json)
3. `npm run build:11ty` - Generate static site and include assets in `dist/`

The build process uses Vite's **manifest file** to handle hashed filenames:
- Vite generates `dist/assets/manifest.json` mapping source files to hashed outputs
- 11ty reads the manifest and uses it to reference the correct hashed files
- The `{{ 'src/main.tsx' | viteAsset }}` filter looks up the entry file in the manifest

Or build individually:

```bash
npm run build:css    # Compile Tailwind CSS only
npm run build:vite   # Build Vite SPA only (generates manifest.json)
npm run build:11ty   # Generate 11ty site only (reads manifest for bundle refs)
```

Final output in `dist/`:
- Static pages (HTML) from 11ty
- Tailwind CSS at `/styles.css`
- Vite bundle at `/assets/` with hashed filenames
- React app mounts at `/app/` with dynamic script tag reference

### Type Checking

```bash
npm run type-check
```

### Linting

```bash
npm run lint
```

## Development Scripts

- `npm run dev` - Start dev servers for both 11ty and Vite
- `npm run dev:11ty` - Start 11ty dev server
- `npm run dev:vite` - Start Vite dev server
- `npm run build` - Build both 11ty and Vite
- `npm run build:11ty` - Build only 11ty static site
- `npm run build:vite` - Build only Vite SPA
- `npm run preview` - Preview production build
- `npm run clean` - Clean dist directory
- `npm run type-check` - Run TypeScript type checking
- `npm run lint` - Run ESLint

## Configuration Files

- **`.eleventy.js`** - 11ty configuration
- **`vite.config.js`** - Vite bundler configuration
- **`tailwind.config.js`** - Tailwind CSS configuration
- **`tsconfig.json`** - TypeScript configuration
- **`.eslintrc.cjs`** - ESLint configuration
- **`postcss.config.js`** - PostCSS configuration (for Tailwind)

## Technology Stack

### Frontend Framework
- React 18+ with TypeScript
- Vite (build tool and dev server)

### Static Site Generation
- 11ty (Eleventy)

### State Management & Sync
- Yjs (CRDT library)
- y-webrtc (WebRTC provider)
- y-indexeddb (IndexedDB persistence)

### Styling
- Tailwind CSS
- PostCSS with autoprefixer

### Development Tools
- TypeScript
- ESLint
- Vite

## Deployment

### Hosting

The project is designed to be deployed to static hosting services:

- **Netlify** (recommended for free tier)
- Vercel
- GitHub Pages
- AWS S3 + CloudFront
- Any CDN that supports SPA + static assets

### Build Output

- `dist/` - Output directory containing:
  - 11ty static site files (HTML, assets)
  - `dist/assets/` - Vite-built SPA bundles

## Key Features (MVP)

- ✅ Room creation and joining via shareable links
- ✅ Anonymous voting with card deck (Fibonacci + special cards)
- ✅ Facilitator-controlled vote reveal
- ✅ Multiple voting rounds with discussion
- ✅ Observer role for read-only participants
- ✅ Real-time participant presence
- ✅ Session persistence and export
- ✅ No backend required (peer-to-peer sync)

## Next Steps

See [PLANNING_DOCUMENT.md](./PLANNING_DOCUMENT.md) for full project vision, requirements, and roadmap.

## License

MIT License - see [LICENSE](./LICENSE) for details. Planning Poker is free and open source; contributions and forks are welcome.
