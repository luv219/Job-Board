import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { Page, StatusBadge } from './ui.js';

describe('shared UI', () => {
  it('renders untrusted-looking text as text rather than HTML', () => {
    render(<MemoryRouter><Page title="Job"><p>{'<img src=x onerror=alert(1)>'}</p><StatusBadge status="UNDER_REVIEW" /></Page></MemoryRouter>);
    expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeVisible();
    expect(document.querySelector('img')).toBeNull();
    expect(screen.getByText('Under review')).toBeVisible();
  });
});
