import { BrowserRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './auth.js';
import { queryClient } from './query-client.js';
import { AppRouter } from './router.js';
import { AppErrorBoundary } from './error-boundary.js';

export function App() { return <AppErrorBoundary><QueryClientProvider client={queryClient}><AuthProvider><BrowserRouter><AppRouter /></BrowserRouter></AuthProvider></QueryClientProvider></AppErrorBoundary>; }
