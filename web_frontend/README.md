# EMS Web Frontend

Vite + React frontend for the EMS backend health console.

## Local development

```bash
npm install
npm run dev
```

The app defaults to `http://localhost:8000` for the backend. You can set a build-time default with:

```bash
VITE_BACKEND_URL=https://ems-backend.your-domain.com npm run build
```

The UI also lets you enter and save the backend URL in the browser.

## CapRover

The CapRover workflow expects this folder and [`captain-definition`](captain-definition). Create a CapRover app for the frontend and set GitHub secrets:

```text
CAPROVER_SERVER=https://captain.your-domain.com
CAPROVER_FRONTEND_APP=ems-frontend
CAPROVER_FRONTEND_APP_TOKEN=your-frontend-app-token
```

The frontend container serves nginx on port `80`, so CapRover can keep the default container HTTP port.
