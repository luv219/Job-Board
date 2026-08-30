import { Link, NavLink, useNavigate } from 'react-router-dom';
import type { ButtonHTMLAttributes, PropsWithChildren, ReactNode } from 'react';
import { useEffect, useState } from 'react';
import type { ApplicationStatus } from '@job-board/contracts';
import { dashboardPath, useAuth } from '../app/auth.js';

export function Page({ title, intro, children }: PropsWithChildren<{ title: string; intro?: string }>) {
  useEffect(() => { document.title = `${title} · Job Board`; }, [title]);
  return <main className="page"><header className="page-heading"><h1>{title}</h1>{intro ? <p>{intro}</p> : null}</header>{children}</main>;
}
export function Card({ children, className = '' }: PropsWithChildren<{ className?: string }>) { return <section className={`card ${className}`}>{children}</section>; }
export function Notice({ children, tone = 'info' }: PropsWithChildren<{ tone?: 'info' | 'error' | 'success' }>) { return <p className={`notice ${tone}`} role={tone === 'error' ? 'alert' : 'status'}>{children}</p>; }
export function Loading({ label = 'Loading…' }: { label?: string }) { return <p className="loading" role="status">{label}</p>; }
export function EmptyState({ title, action }: { title: string; action?: ReactNode }) { return <Card className="empty"><h2>{title}</h2>{action}</Card>; }
export function Button({ children, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) { return <button className="button" {...props}>{children}</button>; }
export function ButtonLink({ children, to, secondary = false }: { children: ReactNode; to: string; secondary?: boolean }) { return <Link className={`button ${secondary ? 'secondary' : ''}`} to={to}>{children}</Link>; }
export function Field({ label, error, children }: PropsWithChildren<{ label: string; error?: string | undefined }>) { return <label className="field"><span>{label}</span>{children}{error ? <small role="alert">{error}</small> : null}</label>; }
const labels: Record<ApplicationStatus, string> = { SUBMITTED: 'Submitted', UNDER_REVIEW: 'Under review', SHORTLISTED: 'Shortlisted', INTERVIEW: 'Interview', OFFER: 'Offer', HIRED: 'Hired', REJECTED: 'Rejected', WITHDRAWN: 'Withdrawn' };
export function StatusBadge({ status }: { status: ApplicationStatus | 'DRAFT' | 'PUBLISHED' | 'CLOSED' | 'ARCHIVED' }) { return <span className={`badge ${status.toLowerCase()}`}>{labels[status as ApplicationStatus] ?? status[0] + status.slice(1).toLowerCase()}</span>; }
export function Pagination({ page, totalPages, onPage }: { page: number; totalPages: number; onPage: (page: number) => void }) {
  if (totalPages <= 1) return null;
  return <nav className="pagination" aria-label="Pagination"><Button disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</Button><span>Page {page} of {totalPages}</span><Button disabled={page >= totalPages} onClick={() => onPage(page + 1)}>Next</Button></nav>;
}
export function Shell({ children }: PropsWithChildren) {
  const { status, user, logout } = useAuth(); const [open, setOpen] = useState(false); const navigate = useNavigate();
  const signOut = async () => { await logout(); setOpen(false); navigate('/'); };
  return <><a className="skip-link" href="#main">Skip to content</a><header className="site-header"><Link className="brand" to="/">Job Board</Link><button className="menu-toggle" aria-expanded={open} aria-controls="site-nav" onClick={() => setOpen((value) => !value)}>Menu</button><nav id="site-nav" className={open ? 'open' : ''} aria-label="Primary"> <NavLink to="/jobs" onClick={() => setOpen(false)}>Jobs</NavLink>{status === 'authenticated' && user ? <><NavLink to={dashboardPath(user)} onClick={() => setOpen(false)}>Dashboard</NavLink><NavLink to={user.role === 'APPLICANT' ? '/applicant/profile' : '/employer/profile'} onClick={() => setOpen(false)}>Account</NavLink>{!user.emailVerified ? <NavLink to="/verify-email" onClick={() => setOpen(false)}>Verify email</NavLink> : null}<button className="link-button" onClick={() => void signOut()}>Log out</button></> : <>{status !== 'initializing' ? <><NavLink to="/login">Log in</NavLink><NavLink className="nav-cta" to="/register">Create account</NavLink></> : null}</>}</nav></header><div id="main">{children}</div></>;
}
