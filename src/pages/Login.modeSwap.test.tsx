// ── Login.modeSwap.test.tsx ─────────────────────────────────────────────────
// Regression guard for the login/signup mode swap (#365, #685).
//
// Switching between "Log in" and "Sign up" must clear the transient form
// state of the mode being left: a validation or server error, and a stuck
// "busy" submit. This used to be an effect that watched `mode`; #685 moved
// the reset into the toggle's click handler. These tests pin the behaviour
// itself, so they fail if the reset is ever dropped from either place.
//
// The auth provider is replaced at the feature seam: the page only needs
// `user`, `loading`, `signIn` and `signUp` from it.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const auth = vi.hoisted(() => ({
  signIn: vi.fn(),
  signUp: vi.fn(),
}));

vi.mock('../features/auth', () => ({
  useAuth: () => ({ user: null, loading: false, signIn: auth.signIn, signUp: auth.signUp }),
}));

import Login from './Login';

/** Render the page inside a router (it navigates after a sign-in). */
function renderLogin() {
  return render(
    <MemoryRouter initialEntries={['/login']}>
      <Login />
    </MemoryRouter>,
  );
}

/** The form's submit button, whatever its current label. */
function submitButton(): HTMLButtonElement {
  const button = document.querySelector('form button[type="submit"]');
  if (!(button instanceof HTMLButtonElement)) throw new Error('submit button not found');
  return button;
}

/**
 * One of the page's two mode tabs. Scoped to the toggle group: the site
 * header also has a "Sign up" link.
 */
function modeTab(name: 'Log in' | 'Sign up'): HTMLElement {
  return within(screen.getByRole('group', { name: 'Log in or sign up' })).getByText(name);
}

/** Type into the input with the given id. */
function typeInto(id: string, value: string): void {
  const input = document.getElementById(id);
  if (!(input instanceof HTMLInputElement)) throw new Error(`input #${id} not found`);
  fireEvent.change(input, { target: { value } });
}

beforeEach(() => {
  auth.signIn.mockReset();
  auth.signUp.mockReset();
});

afterEach(() => {
  cleanup();
});

describe('Login mode swap (#365)', () => {
  it('clears a validation error when the fan switches to signup and back', () => {
    renderLogin();
    fireEvent.click(submitButton());
    expect(screen.getByText('Email and password are required.')).toBeTruthy();

    fireEvent.click(modeTab('Sign up'));
    expect(screen.queryByText('Email and password are required.')).toBeNull();

    fireEvent.click(submitButton());
    expect(screen.getByText('Email and password are required.')).toBeTruthy();

    fireEvent.click(modeTab('Log in'));
    expect(screen.queryByText('Email and password are required.')).toBeNull();
  });

  it('clears a server error from a failed sign-in when switching to signup', async () => {
    auth.signIn.mockResolvedValue('Invalid login credentials');
    renderLogin();
    typeInto('email', 'fan@isl.test');
    typeInto('password', 'a-long-enough-password');
    await act(async () => {
      fireEvent.click(submitButton());
    });
    expect(screen.getByText('Invalid login credentials')).toBeTruthy();

    fireEvent.click(modeTab('Sign up'));
    expect(screen.queryByText('Invalid login credentials')).toBeNull();
  });

  it('releases a stuck "busy" submit when the mode changes', async () => {
    // A sign-in that never answers leaves the form busy.
    auth.signIn.mockReturnValue(new Promise<string | null>(() => {}));
    renderLogin();
    typeInto('email', 'fan@isl.test');
    typeInto('password', 'a-long-enough-password');
    await act(async () => {
      fireEvent.click(submitButton());
    });
    expect(submitButton().disabled).toBe(true);
    expect(submitButton().textContent).toBe('Signing in\u2026');

    fireEvent.click(modeTab('Sign up'));
    expect(submitButton().disabled).toBe(false);
    expect(submitButton().textContent).toBe('Create account');
  });

  it('clears the typed password but keeps the email when the mode changes', () => {
    renderLogin();
    typeInto('email', 'fan@example.com');
    typeInto('password', 'half-typed-signup-pass');
    fireEvent.click(modeTab('Sign up'));
    expect((document.getElementById('password') as HTMLInputElement).value).toBe('');
    expect((document.getElementById('email') as HTMLInputElement).value).toBe('fan@example.com');
    typeInto('password', 'another-password');
    fireEvent.click(modeTab('Log in'));
    expect((document.getElementById('password') as HTMLInputElement).value).toBe('');
  });

  it('keeps the password when the fan clicks the mode already shown', () => {
    renderLogin();
    typeInto('password', 'still-typing');
    fireEvent.click(modeTab('Log in'));
    expect((document.getElementById('password') as HTMLInputElement).value).toBe('still-typing');
  });

  it('leaves the error alone when the fan clicks the mode already shown', () => {
    renderLogin();
    fireEvent.click(submitButton());
    expect(screen.getByText('Email and password are required.')).toBeTruthy();

    // Same behaviour as the old effect keyed on `mode`: no mode change, no reset.
    fireEvent.click(modeTab('Log in'));
    expect(screen.getByText('Email and password are required.')).toBeTruthy();
  });
});
