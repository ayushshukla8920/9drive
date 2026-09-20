# 9Drive

9Drive is a Cloudflare Access-protected storage workspace that aggregates Google Drive and S3-compatible storage in one object browser. The API and Next.js dashboard run together in one Express process.

## Architecture

- `backend/` – Express API, Prisma, MySQL, Google Drive and S3 provider services.
- `frontend/` – Next.js dashboard, served by Express at runtime.
- Nginx – host-managed reverse proxy; it is intentionally not included in this repository.

The application has no local login, password, or bearer-token flow. Cloudflare Zero Trust controls access to the deployment. MySQL retains a single internal workspace record solely to preserve the existing ownership relationships between accounts, files, folders, and shares.

## Requirements

- Node.js 20.9 or later
- npm
- MySQL 8 or later
- A Google Cloud project with the Drive API enabled when connecting Google Drive
- A Cloudflare Access policy protecting the deployment hostname

## Environment

Create `.env` in the repository root:

```env
DATABASE_URL="mysql://USER:PASSWORD@127.0.0.1:3306/9drive"
APP_PORT=4000
FRONTEND_URL="https://s3.equaly.dev"
TOKEN_ENCRYPTION_KEY="a-long-random-secret-with-at-least-32-characters"
ACCESS_TOKEN_TTL_SECONDS=900
REFRESH_TOKEN_TTL_DAYS=30
MAX_UPLOAD_BYTES=5368709120
RECAPTCHA_SECRET_KEY=""

# Used only by the Google-config seed command.
GOOGLE_CLIENT_ID=""
GOOGLE_CLIENT_SECRET=""
GOOGLE_REDIRECT_URI="https://s3.equaly.dev/connected-accounts/google/callback"
```

`FRONTEND_URL` must be the public hostname served by your Nginx and protected by Cloudflare Access. Add `GOOGLE_REDIRECT_URI` to the authorized redirect URIs in the Google Cloud OAuth client.

## Local installation

From the repository root:

```powershell
npm run install:apps
npm run db:migrate
npm run google:seed
npm run build
npm start
```

`npm run deploy` runs the Prisma client generation, database migrations, Google configuration seed, and both builds in one command. Run `npm start` afterwards.

`server.mjs` at the repository root starts Express and serves both API endpoints and the built Next.js UI on `APP_PORT`. Run `npm run dev` for Next development mode after building the backend once.

## Host Nginx

Nginx should proxy the single local Express port to the protected hostname. A minimal server block looks like this:

```nginx
server {
  server_name s3.equaly.dev;

  location / {
    proxy_pass http://127.0.0.1:4000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

Keep port `4000` bound locally or firewalled from the public internet. Cloudflare Access must protect `s3.equaly.dev`; direct access to the origin must not bypass the Cloudflare edge.

## Features

- Google Drive and S3-compatible storage connections
- Direct streaming uploads; uploaded object bytes never persist on the server disk
- Resumable Google Drive uploads
- Most-available, round-robin, and priority upload routing
- Virtual folders, search, previews, downloads, sharing, and trash
- Public share links and expiring preview tokens
- API keys for `POST /api/v1/uploads`

## Verification

Run these checks before deployment:

```powershell
npm run build
```

Then confirm that the Cloudflare-protected hostname loads the object browser, Google Drive connects using the public callback URL, and objects can upload, preview, and download through the single Nginx proxy.
