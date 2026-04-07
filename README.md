# Sideline

<p align="center">
  <img src="frontend/src/logo.svg" alt="Sideline logo" width="140" />
</p>

Sideline is a soccer video and team management app built for coaches and parents.

It helps teams organize matches, upload clips, tag key moments, manage membership requests, and share game context in one place.

## Open the app

Live web app: [Sideline](https://jettnguyen.github.io/Sideline/)

## Install on mobile (recommended)

Sideline works best as an installed web app.

### iOS

1. Open Sideline in Safari
2. Tap ```Share```
3. Tap ```Add to Home Screen```
4. Confirm ```Open as Web App``` is enabled
5. Tap ```Add```

### Android

1. Open Sideline in Chrome
2. Open the browser menu (three dots)
3. Tap ```Add to home screen```
4. Confirm installation

## Features

- Create and manage teams
- Invite users or approve join requests
- Assign team-specific roles
- Add matches and upload clips
- Tag important moments during playback
- View clips by match, player, and profile
- Use the app in PWA mode on mobile

## Local development

### 1. Backend

```bash
cd backend
npm install
npm run dev
```

### 2. Frontend

```bash
cd frontend
npm install
npm start
```

## Tech stack

- React
- Node.js + Express
- MongoDB + Mongoose
- AWS S3 (media storage)
- Uppy (upload pipeline)
