import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { api, ApiError } from '../lib/api.js';
import { dashboardPath, useAuth } from '../app/auth.js';
import { Button, Card, Field, Loading, Notice, Page } from '../components/ui.js';

const credentialsSchema = z.object({ email: z.email('Enter a valid email address'), password: z.string().min(12, 'Password must be at least 12 characters').max(128) });
type Credentials = z.infer<typeof credentialsSchema>;
function errorMessage(error: unknown): string { if (error instanceof ApiError) return error.status === 429 ? 'Too many requests. Please try again shortly.' : error.message; return 'Unable to reach the service. Please try again.'; }

export function LoginPage() {
  const { login } = useAuth(); const navigate = useNavigate(); const form = useForm<Credentials>({ resolver: zodResolver(credentialsSchema) }); const [error, setError] = useState<string>();
  const submit = form.handleSubmit(async (values) => { setError(undefined); try { const user = await login(values.email, values.password); navigate(dashboardPath(user), { replace: true }); } catch { setError('Email or password is incorrect. Please try again.'); } });
  return <Page title="Log in" intro="Access your Job Board account."><Card className="form-card"><form onSubmit={submit} noValidate><Field label="Email" error={form.formState.errors.email?.message}><input type="email" autoComplete="email" {...form.register('email')} /></Field><Field label="Password" error={form.formState.errors.password?.message}><input type="password" autoComplete="current-password" {...form.register('password')} /></Field>{error ? <Notice tone="error">{error}</Notice> : null}<Button disabled={form.formState.isSubmitting} type="submit">{form.formState.isSubmitting ? 'Logging in…' : 'Log in'}</Button></form><p><Link to="/forgot-password">Forgot password?</Link></p><p>New here? <Link to="/register">Create an account</Link>.</p></Card></Page>;
}

type Registration = Credentials & { role: 'APPLICANT' | 'EMPLOYER'; confirmPassword: string };
const registrationSchema = credentialsSchema.extend({ role: z.enum(['APPLICANT', 'EMPLOYER']), confirmPassword: z.string() }).refine((values) => values.password === values.confirmPassword, { path: ['confirmPassword'], message: 'Passwords do not match' });
export function RegisterPage() {
  const { register: createAccount } = useAuth(); const navigate = useNavigate(); const form = useForm<Registration>({ resolver: zodResolver(registrationSchema), defaultValues: { role: 'APPLICANT' } }); const [error, setError] = useState<string>();
  const submit = form.handleSubmit(async ({ email, password, role }) => { setError(undefined); try { const user = await createAccount(email, password, role); navigate(dashboardPath(user), { replace: true }); } catch (cause) { setError(errorMessage(cause)); } });
  return <Page title="Create your account" intro="Choose the account type that matches how you will use Job Board."><Card className="form-card"><form onSubmit={submit} noValidate><fieldset><legend>Account type</legend><label><input type="radio" value="APPLICANT" {...form.register('role')} /> Applicant — find and apply for jobs</label><label><input type="radio" value="EMPLOYER" {...form.register('role')} /> Employer — publish and manage jobs</label></fieldset><Field label="Email" error={form.formState.errors.email?.message}><input type="email" autoComplete="email" {...form.register('email')} /></Field><Field label="Password" error={form.formState.errors.password?.message}><input type="password" autoComplete="new-password" {...form.register('password')} /><small>Use 12–128 characters.</small></Field><Field label="Confirm password" error={form.formState.errors.confirmPassword?.message}><input type="password" autoComplete="new-password" {...form.register('confirmPassword')} /></Field>{error ? <Notice tone="error">{error}</Notice> : null}<Button disabled={form.formState.isSubmitting} type="submit">{form.formState.isSubmitting ? 'Creating account…' : 'Create account'}</Button></form></Card></Page>;
}

export function ForgotPasswordPage() {
  const [email, setEmail] = useState(''); const [message, setMessage] = useState<string>(); const [error, setError] = useState<string>(); const [sending, setSending] = useState(false);
  const submit = async (event: FormEvent) => { event.preventDefault(); setSending(true); setError(undefined); try { const response = await api.post<{ message: string }>('/auth/password-reset/request', { email }); setMessage(response.message); } catch (cause) { setError(errorMessage(cause)); } finally { setSending(false); } };
  return <Page title="Reset password" intro="Enter your email and we’ll send reset instructions if an account exists."><Card className="form-card"><form onSubmit={submit}><Field label="Email"><input required type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} /></Field>{message ? <Notice tone="success">{message}</Notice> : null}{error ? <Notice tone="error">{error}</Notice> : null}<Button disabled={sending} type="submit">{sending ? 'Sending…' : 'Send reset link'}</Button></form></Card></Page>;
}

function useOneTimeToken() { const [params, setParams] = useSearchParams(); const token = params.get('token') ?? ''; const clear = () => { params.delete('token'); setParams(params, { replace: true }); }; return { token, clear }; }
export function ResetPasswordPage() {
  const { token, clear } = useOneTimeToken(); const navigate = useNavigate(); const [password, setPassword] = useState(''); const [confirm, setConfirm] = useState(''); const [error, setError] = useState<string>(); const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent) => { event.preventDefault(); if (password.length < 12) return setError('Password must be at least 12 characters.'); if (password !== confirm) return setError('Passwords do not match.'); setBusy(true); setError(undefined); try { await api.post<void>('/auth/password-reset/confirm', { token, newPassword: password }); clear(); navigate('/login', { replace: true, state: { message: 'Password reset. Please log in again.' } }); } catch (cause) { setError(errorMessage(cause)); } finally { setBusy(false); } };
  if (!token) return <Page title="Reset password"><Notice tone="error">This reset link is missing or invalid.</Notice><Link to="/forgot-password">Request a new link</Link></Page>;
  return <Page title="Choose a new password"><Card className="form-card"><form onSubmit={submit}><Field label="New password"><input required minLength={12} type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} /></Field><Field label="Confirm new password"><input required type="password" autoComplete="new-password" value={confirm} onChange={(event) => setConfirm(event.target.value)} /></Field>{error ? <Notice tone="error">{error}</Notice> : null}<Button disabled={busy} type="submit">{busy ? 'Resetting…' : 'Reset password'}</Button></form></Card></Page>;
}

export function VerifyEmailPage() {
  const { token, clear } = useOneTimeToken(); const { user, resendVerification } = useAuth(); const [message, setMessage] = useState<string>(); const [error, setError] = useState<string>(); const [busy, setBusy] = useState(false);
  useEffect(() => { if (!token) return; let active = true; void api.post<void>('/auth/email-verification/confirm', { token }).then(() => { if (active) { clear(); setMessage('Your email has been verified.'); } }).catch((cause: unknown) => { if (active) { clear(); setError(errorMessage(cause)); } }); return () => { active = false; }; }, [clear, token]);
  if (token) return <Page title="Verifying email"><Loading label="Verifying your email…" /></Page>;
  const resend = async () => { setBusy(true); setError(undefined); try { await resendVerification(); setMessage('Verification email sent.'); } catch (cause) { setError(errorMessage(cause)); } finally { setBusy(false); } };
  return <Page title="Email verification"><Card>{message ? <Notice tone="success">{message}</Notice> : null}{error ? <Notice tone="error">{error}</Notice> : null}{user && !user.emailVerified ? <Button disabled={busy} onClick={() => void resend()}>{busy ? 'Sending…' : 'Resend verification email'}</Button> : <p>Open a verification link from your email, or sign in to request a new link.</p>}</Card></Page>;
}
