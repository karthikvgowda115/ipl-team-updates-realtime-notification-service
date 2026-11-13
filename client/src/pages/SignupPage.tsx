import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toApiError } from '../api/auth';
import { useAuth } from '../auth/AuthContext';

type Field = 'name' | 'username' | 'email' | 'password' | 'confirmPassword';
type FieldErrors = Partial<Record<Field, string>>;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_RE = /^[a-zA-Z0-9._]{3,30}$/;

// Mirrors the server rules so users get instant feedback; the server still validates.
function validate(v: Record<Field, string>): FieldErrors {
  const e: FieldErrors = {};
  const name = v.name.trim();
  if (name.length < 2 || name.length > 50) e.name = 'Name must be 2–50 characters.';
  if (!USERNAME_RE.test(v.username.trim())) {
    e.username = 'Username must be 3–30 characters: letters, numbers, dots or underscores.';
  }
  if (!EMAIL_RE.test(v.email.trim())) e.email = 'Enter a valid email address.';
  if (v.password.length < 8) e.password = 'Password must be at least 8 characters.';
  else if (v.password.length > 72) e.password = 'Password must be at most 72 characters.';
  if (v.confirmPassword !== v.password) e.confirmPassword = 'Passwords do not match.';
  return e;
}

export default function SignupPage() {
  const { register } = useAuth();
  const navigate = useNavigate();

  const [values, setValues] = useState<Record<Field, string>>({
    name: '',
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
  });
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

    const errors = validate(values);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSubmitting(true);
    try {
      // Registering also logs the user in (the API returns a token).
      await register({
        name: values.name.trim(),
        username: values.username.trim(),
        email: values.email.trim(),
        password: values.password,
      });
      navigate('/dashboard', { replace: true });
    } catch (err) {
      const apiErr = toApiError(err);
      setFieldErrors((apiErr.errors ?? {}) as FieldErrors);
      setFormError(apiErr.message);
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
    <form className="auth-card" onSubmit={onSubmit} noValidate>
      <h2>Create your account</h2>
      <p className="muted">Follow your favourite IPL teams and get live updates.</p>

      {formError && (
        <div className="alert" role="alert">
          {formError}
        </div>
      )}

      {input('name', 'Full name', 'text', 'name')}
      {input('username', 'Username', 'text', 'username')}
      {input('email', 'Email', 'email', 'email')}
      {input('password', 'Password', 'password', 'new-password')}
      {input('confirmPassword', 'Confirm password', 'password', 'new-password')}

      <button type="submit" className="full" disabled={submitting}>
        {submitting ? 'Creating account…' : 'Sign up'}
      </button>

      <p className="switch">
        Already have an account? <Link to="/login">Log in</Link>
      </p>
    </form>
  );
}
