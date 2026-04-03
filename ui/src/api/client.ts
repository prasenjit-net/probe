import axios from 'axios'

/**
 * Central Axios instance.
 * `withCredentials` ensures the session cookie is sent on every request.
 * The Vite dev-server proxies `/api` → `http://localhost:3000`.
 */
export const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
})
