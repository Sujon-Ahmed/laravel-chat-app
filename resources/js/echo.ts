import Echo from 'laravel-echo';
import Pusher from 'pusher-js';

declare global {
    interface Window {
        Echo: Echo<'reverb'>;
        Pusher: typeof Pusher;
    }
}

window.Pusher = Pusher;

/**
 * The broadcasting auth route is registered under the "api" prefix in
 * bootstrap/app.php, so Echo's default of "/broadcasting/auth" would 404.
 */
const authEndpoint = '/api/broadcasting/auth';

/**
 * Sanctum authenticates the auth request with the session cookie, so the
 * current CSRF token has to be sent as well. It is read per request because
 * the token is regenerated on login without a page reload.
 */
const authorizationHeaders = (): Record<string, string> => {
    const match = document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]*)/);

    return match ? { 'X-XSRF-TOKEN': decodeURIComponent(match[1]) } : {};
};

window.Echo = new Echo({
    broadcaster: 'reverb',
    key: import.meta.env.VITE_REVERB_APP_KEY,
    wsHost: import.meta.env.VITE_REVERB_HOST,
    wsPort: Number(import.meta.env.VITE_REVERB_PORT ?? 80),
    wssPort: Number(import.meta.env.VITE_REVERB_PORT ?? 443),
    forceTLS: (import.meta.env.VITE_REVERB_SCHEME ?? 'https') === 'https',
    enabledTransports: ['ws', 'wss'],
    authEndpoint,
    channelAuthorization: {
        transport: 'ajax',
        endpoint: authEndpoint,
        headersProvider: authorizationHeaders,
    },
});
