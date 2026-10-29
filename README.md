# Real-Time Chat

A Laravel 13 + Inertia v3 + React 19 application with private conversation messaging over Laravel Reverb.

## Requirements

- PHP 8.3+
- Composer
- Node.js / npm
- MySQL (this project's `.env`) or SQLite (`.env.example` default)

## Getting started

```bash
composer install
cp .env.example .env
# set DB_CONNECTION / DB_* to match your database
php artisan key:generate
php artisan migrate
npm install
```

Then start the development stack:

```bash
composer dev
```

`composer dev` runs `php artisan dev`, which starts the HTTP server, the Vite dev server and a `queue:listen` worker (plus Pail where `pcntl_fork` is available, i.e. not on Windows). Reverb is **not** part of that stack and has to be started separately (see below).

## Realtime (Reverb)

Message broadcasts go through Reverb. Two ports are involved, and they must agree:

| Variable             | Used by           | Meaning                                                                                     |
| -------------------- | ----------------- | ------------------------------------------------------------------------------------------- |
| `REVERB_SERVER_HOST` | Reverb server     | Interface `reverb:start` binds to (`0.0.0.0` to accept remote connections)                  |
| `REVERB_SERVER_PORT` | Reverb server     | The port `reverb:start` actually listens on                                                 |
| `REVERB_HOST`        | Laravel + browser | Host clients connect to (`localhost` in development)                                        |
| `REVERB_PORT`        | Laravel + browser | Port clients connect to — must match `REVERB_SERVER_PORT` unless Reverb sits behind a proxy |
| `REVERB_SCHEME`      | Laravel + browser | `http` locally, `https` behind TLS                                                          |

Only set `REVERB_PORT` to a different value than `REVERB_SERVER_PORT` when something (nginx, a load balancer) terminates TLS and forwards to Reverb. Reverb itself always listens on `REVERB_SERVER_PORT`.

The `VITE_REVERB_*` variables used by `resources/js/echo.ts` are `${REVERB_*}` references, so the browser always follows the values above. Changing them requires restarting the Vite dev server.

This project uses **port 8081**:

```dotenv
BROADCAST_CONNECTION=reverb

REVERB_APP_ID=...
REVERB_APP_KEY=...
REVERB_APP_SECRET=...
REVERB_SERVER_HOST=0.0.0.0
REVERB_SERVER_PORT=8081
REVERB_HOST="localhost"
REVERB_PORT=8081
REVERB_SCHEME=http

VITE_REVERB_APP_KEY="${REVERB_APP_KEY}"
VITE_REVERB_HOST="${REVERB_HOST}"
VITE_REVERB_PORT="${REVERB_PORT}"
VITE_REVERB_SCHEME="${REVERB_SCHEME}"
```

8080 is deliberately avoided: on Laragon, nginx already listens on 8080, so the broadcast HTTP calls would be answered by nginx (a 404 page) instead of Reverb.

### Running it

```bash
php artisan reverb:start
# INFO  Starting server on 0.0.0.0:8081 (localhost).
```

Start it in its own terminal, or register it with the dev command so it runs alongside everything else. Restart it after changing any `REVERB_*` variable — the port is read at boot.

A queue worker must also be running for realtime delivery: `App\Events\MessageSent` implements `ShouldBroadcast`, so sending a message only queues an `Illuminate\Broadcasting\BroadcastEvent` job. `composer dev` already starts `queue:listen --tries=1`. If you only run `php artisan serve` and `reverb:start`, messages are stored but nobody receives them in realtime.

### Troubleshooting

- **Message saved, but others never see it in realtime.** The queued broadcast failed or never ran. Make sure a queue worker is running; if Reverb was unreachable when the job was processed, the job is in `failed_jobs` (the dev worker runs with `--tries=1`) and the exception is in `storage/logs/laravel.log`. Inspect with `php artisan queue:failed`.
- **Sending a message returns 500.** Because `MessageSent` is queued, the request only fails if the broadcast job cannot be pushed — check `QUEUE_CONNECTION` and that the `jobs` table exists (`php artisan migrate`).
- **`storage/logs/laravel.log` shows `Pusher error: <html>...<title>404 Not Found</title>...nginx/...`.** Something other than Reverb (nginx) answered on the broadcast port — the Reverb server is not listening where the app is sending.
- **Connection refused on the broadcast port** — `reverb:start` never ran, or it is bound to a different port.
- **Confirm Reverb is reachable:**
    ```bash
    curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8081/apps/<REVERB_APP_ID>/events
    ```
    `405` (method not allowed) means the endpoint is alive; an nginx 404 page or no response means it is not.
- **Check who owns a port (Windows):**
    ```bash
    netstat -ano | grep -E ':8081\s.*LISTENING'
    ```

Broadcasting behaviour is covered by `tests/Feature/ConversationBroadcastingTest.php` (event channel and payload, plus private channel authorization) and `tests/Feature/ChatMessageTest.php` (sending a message stores it and queues the broadcast).

## Testing

```bash
php artisan test --compact
```
