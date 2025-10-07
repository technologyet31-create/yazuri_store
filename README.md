VVV Backend
===============

What this provides
- A small Express server with REST endpoints for orders (CRUD).
- File-based persistence in `data/orders.json`.
- A WebSocket relay (using `ws`) that broadcasts messages to connected clients.
- Optional token gating via the `REALTIME_TOKEN` environment variable.

Quick start

1. Install dependencies

```powershell
npm install
```

2. (Optional) set a shared token to gate realtime access

Windows PowerShell example (set for current session):

```powershell
$env:REALTIME_TOKEN = 'sometoken'
```

Or to set permanently (PowerShell):

```powershell
setx REALTIME_TOKEN "sometoken"
```

3. Start the server

```powershell
npm start
```

The server will listen on port 3000 by default. Open `http://localhost:3000/admin.html` or `employee.html`.

API
- GET /api/orders
- GET /api/orders/:id
- POST /api/orders
- PUT /api/orders/:id
- DELETE /api/orders/:id

All `/api` endpoints accept the `x-realtime-token` header or `?token=` query param when `REALTIME_TOKEN` is set.

WebSocket URL
- ws://HOST:PORT/?token=YOURTOKEN (if REALTIME_TOKEN is used)

Behavior
- When an order is created/updated/deleted via REST the server will persist changes and broadcast an event over WebSocket to other connected clients.
- Clients may also send messages of form `{ type: 'orders:publish', orders: [...] , save: true }` to ask the server to persist the provided orders and broadcast them.

Notes and next steps
- For production, put a reverse proxy (nginx) in front for TLS and stronger auth.
- Consider moving persistence to a proper database for scaling and reliability.

MySQL (recommended) setup
-------------------------
The server supports MySQL as the primary persistence layer. If MySQL is configured via environment variables, the server will use MySQL and will auto-create a minimal `orders` table. If MySQL is not configured or fails to initialize the server will fall back to a local JSON file at `data/orders.json`.

Environment variables (choose one):
- Provide a full `DATABASE_URL` in the form: `mysql://user:pass@host:3306/dbname`
	or set these separately:
	- `MYSQL_HOST` - MySQL host (e.g., localhost)
	- `MYSQL_USER` - MySQL username
	- `MYSQL_PASSWORD` - MySQL password
	- `MYSQL_DATABASE` - database name

Example (PowerShell):

```powershell
setx MYSQL_HOST "127.0.0.1"
setx MYSQL_USER "myuser"
setx MYSQL_PASSWORD "mypassword"
setx MYSQL_DATABASE "vvv"
# Then restart your shell/session so environment variables are visible
npm install
npm start
```

Notes:
- The server will attempt to create the table `orders` with columns: `id` (primary key), `data` (JSON), `created_at`, `updated_at`.
- For production, create a dedicated MySQL user and database and grant least privileges.

Deploying to a remote host (public URL)
-------------------------------------
You can run this server on any VPS or cloud VM (DigitalOcean, AWS EC2, etc.). Recommended steps:

1) Provision a VM and install Node.js and MySQL (or use managed MySQL). Create the database and user as shown earlier.

2) Copy project files to the VM and install dependencies:

```bash
npm install
```

3) Configure environment variables on the VM (example for a systemd service unit or export in your shell):

```bash
export MYSQL_HOST=127.0.0.1
export MYSQL_USER=vvvuser
export MYSQL_PASSWORD=s3cret
export MYSQL_DATABASE=vvv
export REALTIME_TOKEN=sometoken   # optional
export PORT=3000
npm start
```

4) Run behind a reverse proxy (recommended):

- Install nginx and add a site config to proxy requests to the Node server. This lets you enable HTTPS with a Let's Encrypt certificate.

Example nginx snippet:

```
server {
	listen 80;
	server_name example.com;

	location / {
		proxy_pass http://127.0.0.1:3000;
		proxy_http_version 1.1;
		proxy_set_header Upgrade $http_upgrade;
		proxy_set_header Connection 'upgrade';
		proxy_set_header Host $host;
		proxy_cache_bypass $http_upgrade;
	}
}
```

Then use certbot to get a TLS certificate and make your site available at https://example.com.

5) Use a process manager to keep the Node process up (PM2, systemd):

Example with PM2:

```bash
npm install -g pm2
pm2 start server.js --name vvv-backend
pm2 save
pm2 startup
```

After this you'll have a public URL (your domain) where admin/employee/customer pages are reachable. Use the `REALTIME_TOKEN` to protect WebSocket and REST access with a shared token, or implement stronger authentication.

Helper scripts (quick local setup)
--------------------------------
Two helper PowerShell scripts are included in `scripts/` to make local testing and public exposure easier:

- `scripts/start-mysql-and-server.ps1` — starts a MySQL Docker container (named `vvv-mysql`), sets env vars for this session, and starts the Node server. Usage:

```powershell
.\scripts\start-mysql-and-server.ps1
```

- `scripts/start-ngrok.ps1` — starts ngrok to expose local port 3000 publicly (requires `ngrok` installed and authtoken configured). Usage:

```powershell
.\scripts\start-ngrok.ps1
```

After running both scripts, ngrok will show a public https://... URL (or use the ngrok web UI at http://127.0.0.1:4040) that remote devices can open.

Hosting the frontend on Netlify
--------------------------------
You can host the static HTML/CSS/JS on Netlify and point it at your backend URL (the server we created). There are two easy ways to tell the client where the backend lives:

1) Set an environment variable in Netlify build settings:
	- Key: BACKEND_URL
	- Value: https://your-server.example.com
	Then deploy your repo to Netlify; the clients will use `window.BACKEND_URL` to call the remote API.

2) Add a meta tag to the HTML files (quick manual method):
	- In `admin.html` (and others) add in the `<head>`:
	  <meta name="backend-url" content="https://your-server.example.com">

The client code will respect `window.BACKEND_URL`, the meta tag, or `?backend=` query param—so you can host the frontend on Netlify and keep the backend on a VPS or on your local machine exposed via ngrok.


