# GitHub Pages Frontend Deployment

This repo includes CI deployment at:

- `.github/workflows/deploy-pages.yml`

## 1. Enable GitHub Pages

In your repository settings:

1. Go to **Settings -> Pages**
2. Under **Build and deployment**, set **Source = GitHub Actions**

## 2. Configure Repository Variables

Go to **Settings -> Secrets and variables -> Actions -> Variables** and set:

- `VITE_AI_ENDPOINT` = your backend URL (for example `https://your-ai-api.run.app`)
- `VITE_AI_DIFFICULTY` (optional, e.g. `expert`)
- `VITE_AI_DEPTH` (optional)
- `VITE_AI_TIME` (optional)

If you use Firebase auth/profile features, also set:

- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`

## 3. Deploy

Push to `main` or `master`.

The workflow will:

1. Build with `VITE_BASE_PATH=/<repo-name>/`
2. Upload `dist/`
3. Deploy to GitHub Pages

## 4. Notes

- `index.html` favicon path uses `%BASE_URL%riderchess.png` for repo-hosted Pages compatibility.
- Frontend AI calls use `VITE_AI_ENDPOINT` in production and `/ai/*` proxy in local dev.
- If `VITE_AI_ENDPOINT` is missing on GitHub Pages, AI calls will fail because there is no local proxy in Pages.
