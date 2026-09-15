import { loginInputSchema, registerInputSchema } from '@tracker/shared';
import { Flame } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/Field';
import { ApiError } from '@/lib/api/client';
import { useAuth } from './AuthProvider';

type Mode = 'login' | 'register';

const COPY = {
  login: {
    title: 'Welcome back',
    subtitle: 'Sign in to keep tracking.',
    submit: 'Sign in',
    switchText: 'Need an account?',
    switchLabel: 'Create one',
    switchTo: '/register',
  },
  register: {
    title: 'Create your account',
    subtitle: 'Start logging meals in under a minute.',
    submit: 'Create account',
    switchText: 'Already registered?',
    switchLabel: 'Sign in',
    switchTo: '/login',
  },
} as const;

export function AuthPage({ mode }: { mode: Mode }) {
  const { user, login, register } = useAuth();
  const navigate = useNavigate();
  const copy = COPY[mode];

  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  if (user) {
    return <Navigate to="/" replace />;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setFieldErrors({});

    const form = new FormData(event.currentTarget);
    const raw = {
      email: String(form.get('email') ?? ''),
      password: String(form.get('password') ?? ''),
      ...(mode === 'register' ? { name: String(form.get('name') ?? '') } : {}),
    };

    // The same schema the API uses, so the message is identical either side.
    const schema = mode === 'register' ? registerInputSchema : loginInputSchema;
    const parsed = schema.safeParse(raw);

    if (!parsed.success) {
      const errors: Record<string, string> = {};

      for (const issue of parsed.error.issues) {
        const path = issue.path.join('.');
        errors[path] ??= issue.message;
      }

      setFieldErrors(errors);
      return;
    }

    setSubmitting(true);

    try {
      if (mode === 'register') {
        await register(parsed.data as Parameters<typeof register>[0]);
      } else {
        await login(parsed.data);
      }

      navigate('/', { replace: true });
    } catch (error) {
      if (error instanceof ApiError) {
        setFieldErrors(error.fieldErrors);
        setFormError(error.details.length > 0 ? null : error.message);
      } else {
        setFormError('Something went wrong. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-plane px-4 py-10">
      <div className="animate-rise w-full max-w-sm">
        <div className="mb-7 flex flex-col items-center text-center">
          <span className="mb-3 flex size-11 items-center justify-center rounded-xl bg-accent text-accent-ink shadow-card">
            <Flame className="size-5" aria-hidden="true" />
          </span>
          <h1 className="text-xl font-semibold text-ink">{copy.title}</h1>
          <p className="mt-1 text-sm text-ink-muted">{copy.subtitle}</p>
        </div>

        <form
          onSubmit={handleSubmit}
          noValidate
          className="space-y-4 rounded-xl border border-line bg-surface p-5 shadow-card"
        >
          {mode === 'register' ? (
            <TextField
              label="Name"
              name="name"
              autoComplete="name"
              placeholder="Alex Chen"
              error={fieldErrors.name}
              required
            />
          ) : null}

          <TextField
            label="Email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            error={fieldErrors.email}
            required
          />

          <TextField
            label="Password"
            name="password"
            type="password"
            autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
            placeholder="At least 8 characters"
            error={fieldErrors.password}
            required
          />

          {formError ? (
            <p role="alert" className="rounded-lg bg-wash px-3 py-2 text-[0.8125rem] text-critical">
              {formError}
            </p>
          ) : null}

          <Button type="submit" variant="primary" loading={submitting} className="w-full">
            {copy.submit}
          </Button>
        </form>

        <p className="mt-4 text-center text-[0.8125rem] text-ink-muted">
          {copy.switchText}{' '}
          <Link to={copy.switchTo} className="font-medium text-accent hover:underline">
            {copy.switchLabel}
          </Link>
        </p>
      </div>
    </main>
  );
}
