import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { toApiError } from '../api/auth';
import { useAuth } from '../auth/AuthContext';

type Field = 'identifier' | 'password';
type FieldErrors = Partial<Record<Field, string>>;

/**
 * User login (/login) and admin login (/admin/login) share this form.
 * The admin variant only lets accounts with the admin role in; anyone else is logged
 * straight back out. (The server enforces the role on every admin API call regardless.)
 */
export default function LoginPage({ variant = 'user' }: { variant?: 'user' | 'admin' }) {
  const isAdmin = variant === 'admin';
  const { login, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? (isAdmin ? '/admin/dashboard' : '/dashboard');

  const [values, setValues] = useState<Record<Field, string>>({ identifier: '', password: '' });
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onChange = (field: Field) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setValues((v) => ({ ...v, [field]: e.target.value }));
    setFieldErrors((fe) => ({ ...fe, [field]: undefined }));
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const errors: FieldErrors = {};
    if (!values.identifier.trim()) errors.identifier = 'Enter your username or email.';
    if (!values.password) errors.password = 'Password is required.';
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSubmitting(true);
    try {
      const user = await login({ identifier: values.identifier.trim(), password: values.password });
      if (isAdmin && user.role !== 'admin') {
        logout();
        setFormError('This account is not an administrator. Use the regular login instead.');
        setValues((v) => ({ ...v, password: '' }));
        setSubmitting(false);
        return;
      }
      navigate(from, { replace: true });
    } catch (err) {
      const apiErr = toApiError(err);
      setFieldErrors((apiErr.errors ?? {}) as FieldErrors);
      setFormError(apiErr.message);
      setValues((v) => ({ ...v, password: '' }));
      setSubmitting(false);
    }
  };

  const input = (field: Field, label: string, type: string, autoComplete: string) => (
    <div className="field">
      <label htmlFor={field}>{label}</label>
      <input
        id={field}
        name={field}
        type={type}
        autoComplete={autoComplete}
        value={values[field]}
        onChange={onChange(field)}
        aria-invalid={!!fieldErrors[field]}
        aria-describedby={fieldErrors[field] ? `${field}-error` : undefined}
        disabled={submitting}
      />
      {fieldErrors[field] && (
        <p id={`${field}-error`} className="field-error">
          {fieldErrors[field]}
        </p>
      )}
    </div>
  );

  return (
    <form className={`auth-card${isAdmin ? ' admin' : ''}`} onSubmit={onSubmit} noValidate>
      <h2>{isAdmin ? 'Admin login' : 'Log in'}</h2>
      <p className="muted">
        {isAdmin ? 'Manage IPL team data. Followers are notified of every change.' : 'Welcome back! Log in to see your team updates.'}
      </p>

      {formError && (
        <div className="alert" role="alert">
          {formError}
        </div>
      )}

      {input('identifier', 'Username or email', 'text', 'username')}
      {input('password', 'Password', 'password', 'current-password')}

      <button type="submit" className="full" disabled={submitting}>
        {submitting ? 'Logging in…' : isAdmin ? 'Log in as admin' : 'Log in'}
      </button>

      {isAdmin ? (
        <p className="switch">
          Not an admin? <Link to="/login">User login</Link>
        </p>
      ) : (
        <p className="switch">
          New here? <Link to="/signup">Create an account</Link> · <Link to="/admin/login">Admin login</Link>
        </p>
      )}
    </form>
  );
}
