import axios from 'axios';

const rawApiBaseUrl = process.env.REACT_APP_API_URL;

if (!rawApiBaseUrl) {
  throw new Error('Missing REACT_APP_API_URL. Set it in your environment for this build.');
}

export const API_BASE_URL = rawApiBaseUrl.replace(/\/$/, '');

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const { response, config } = error;

    if (response?.status === 401) {
      const url = config?.url || '';

      // shouldnt redirect authpoints or errors will disappear instantly (like incorrect login info)
      const isAuthEndpoint = url.includes('/auth/login') || url.includes('/auth/register');

      if(!isAuthEndpoint) {
        localStorage.removeItem('token');
        window.location.hash = '#/login';
      }
    }
    return Promise.reject(error);
  }
);

export default api;
