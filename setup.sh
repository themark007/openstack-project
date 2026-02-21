#!/bin/bash
# Run this from your openstack-project folder:
# bash setup.sh

echo "📝 Creating package.json files..."

# ── Root package.json (backend) ──
cat > package.json << 'EOF'
{
  "name": "markcloud",
  "version": "1.0.0",
  "scripts": {
    "start": "node server.js"
  },
  "dependencies": {
    "axios": "^1.6.0",
    "cors": "^2.8.5",
    "express": "^4.18.2"
  }
}
EOF

# ── frontend/package.json ──
cat > frontend/package.json << 'EOF'
{
  "name": "markcloud-frontend",
  "version": "1.0.0",
  "scripts": {
    "dev": "vite"
  },
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.2.0",
    "vite": "^5.0.0"
  }
}
EOF

# ── frontend/vite.config.js ──
cat > frontend/vite.config.js << 'EOF'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: { '/api': 'http://localhost:3001' }
  }
})
EOF

# ── frontend/index.html ──
cat > frontend/index.html << 'EOF'
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Mark Cloud</title>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/src/main.jsx"></script>
</body>
</html>
EOF

# ── frontend/src/main.jsx ──
cat > frontend/src/main.jsx << 'EOF'
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode><App /></React.StrictMode>
)
EOF

echo "✅ Files created!"
echo ""
echo "📦 Installing backend deps..."
npm install

echo "📦 Installing frontend deps..."
cd frontend && npm install && cd ..

echo ""
echo "🚀 ALL DONE! Now open two terminals:"
echo ""
echo "   Terminal 1:  node server.js"
echo "   Terminal 2:  cd frontend && npx vite"
echo ""
echo "   Open:        http://localhost:3000"
