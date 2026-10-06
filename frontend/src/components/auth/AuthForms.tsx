"use client";

import { Eye, EyeOff } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Field, TextInput } from "@/components/ui/Field";
import { errorMessage } from "@/lib/api";
import { DEMO_ACCOUNT, safeNextPath } from "@/lib/auth";
import { useAuth } from "@/providers/AuthProvider";
import { AuthLayout } from "./AuthLayout";

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const MIN_PASSWORD_LENGTH = 8;

type Errors = Partial<Record<"name" | "email" | "password" | "form", string>>;

/** Sends already-signed-in visitors on to where they were going. */
function useRedirectWhenSignedIn(next: string) {
  const { status } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (status === "authenticated") router.replace(safeNextPath(next));
  }, [status, router, next]);
}

function PasswordInput({
  id,
  value,
  onChange,
  invalid,
  autoComplete,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  invalid: boolean;
  autoComplete: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <TextInput
        id={id}
        type={visible ? "text" : "password"}
        autoComplete={autoComplete}
        value={value}
        invalid={invalid}
        maxLength={128}
        className="pr-11"
        onChange={(event) => onChange(event.target.value)}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Hide password" : "Show password"}
        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-ink-subtle hover:text-ink"
      >
        {visible ? <EyeOff className="size-[18px]" /> : <Eye className="size-[18px]" />}
      </button>
    </div>
  );
}

function FormError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-lg bg-danger/8 px-3 py-2 text-sm font-medium text-danger">
      {message}
    </p>
  );
}

export function LoginForm({ next }: { next: string }) {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [pending, setPending] = useState<"form" | "demo" | null>(null);
  useRedirectWhenSignedIn(next);

  async function signIn(credentials: { email: string; password: string }, source: "form" | "demo") {
    setPending(source);
    try {
      await login(credentials.email, credentials.password);
      // useRedirectWhenSignedIn navigates once the auth state updates.
    } catch (error) {
      setErrors({ form: errorMessage(error) });
      setPending(null);
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const nextErrors: Errors = {
      email: !EMAIL_PATTERN.test(email.trim()) ? "Enter a valid email address." : undefined,
      password: !password ? "Enter your password." : undefined,
    };
    setErrors(nextErrors);
    if (nextErrors.email || nextErrors.password) return;
    signIn({ email: email.trim(), password }, "form");
  }

  return (
    <AuthLayout
      title="Sign in"
      subtitle="Welcome back. Sign in to start or schedule meetings."
      footer={
        <>
          New here?{" "}
          <Link href={`/signup${next !== "/" ? `?next=${encodeURIComponent(next)}` : ""}`} className="font-semibold text-brand hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        <Field id="login-email" label="Email" error={errors.email}>
          <TextInput
            id="login-email"
            type="email"
            autoComplete="email"
            autoFocus
            value={email}
            invalid={Boolean(errors.email)}
            onChange={(event) => {
              setEmail(event.target.value);
              setErrors((current) => ({ ...current, email: undefined, form: undefined }));
            }}
          />
        </Field>
        <Field id="login-password" label="Password" error={errors.password}>
          <PasswordInput
            id="login-password"
            autoComplete="current-password"
            value={password}
            invalid={Boolean(errors.password)}
            onChange={(value) => {
              setPassword(value);
              setErrors((current) => ({ ...current, password: undefined, form: undefined }));
            }}
          />
        </Field>
        <FormError message={errors.form} />
        <Button type="submit" size="lg" loading={pending === "form"} disabled={pending !== null} className="mt-1 w-full">
          Sign in
        </Button>
      </form>

      <div className="my-6 flex items-center gap-3 text-[13px] text-ink-subtle">
        <span className="h-px flex-1 bg-line" />
        or
        <span className="h-px flex-1 bg-line" />
      </div>

      <Button
        variant="secondary"
        size="lg"
        className="w-full"
        loading={pending === "demo"}
        disabled={pending !== null}
        onClick={() => signIn(DEMO_ACCOUNT, "demo")}
      >
        Continue with demo account
      </Button>
      <p className="mt-2 text-center text-[13px] text-ink-subtle">Signs in as Alex Morgan, with sample meetings.</p>
    </AuthLayout>
  );
}

export function SignupForm({ next }: { next: string }) {
  const { signup } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [submitting, setSubmitting] = useState(false);
  useRedirectWhenSignedIn(next);

  function clear(field: keyof Errors) {
    setErrors((current) => ({ ...current, [field]: undefined, form: undefined }));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const nextErrors: Errors = {
      name: !name.trim() ? "Enter your name." : undefined,
      email: !EMAIL_PATTERN.test(email.trim()) ? "Enter a valid email address." : undefined,
      password:
        password.length < MIN_PASSWORD_LENGTH ? `Use at least ${MIN_PASSWORD_LENGTH} characters.` : undefined,
    };
    setErrors(nextErrors);
    if (nextErrors.name || nextErrors.email || nextErrors.password) return;

    setSubmitting(true);
    try {
      await signup(name.trim(), email.trim(), password);
    } catch (error) {
      setErrors({ form: errorMessage(error) });
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout
      title="Create your account"
      subtitle="It's free. You'll be hosting meetings in seconds."
      footer={
        <>
          Already have an account?{" "}
          <Link href={`/login${next !== "/" ? `?next=${encodeURIComponent(next)}` : ""}`} className="font-semibold text-brand hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        <Field id="signup-name" label="Full name" error={errors.name}>
          <TextInput
            id="signup-name"
            autoComplete="name"
            autoFocus
            maxLength={100}
            value={name}
            invalid={Boolean(errors.name)}
            onChange={(event) => {
              setName(event.target.value);
              clear("name");
            }}
          />
        </Field>
        <Field id="signup-email" label="Email" error={errors.email}>
          <TextInput
            id="signup-email"
            type="email"
            autoComplete="email"
            maxLength={255}
            value={email}
            invalid={Boolean(errors.email)}
            onChange={(event) => {
              setEmail(event.target.value);
              clear("email");
            }}
          />
        </Field>
        <Field id="signup-password" label="Password" error={errors.password} hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}>
          <PasswordInput
            id="signup-password"
            autoComplete="new-password"
            value={password}
            invalid={Boolean(errors.password)}
            onChange={(value) => {
              setPassword(value);
              clear("password");
            }}
          />
        </Field>
        <FormError message={errors.form} />
        <Button type="submit" size="lg" loading={submitting} className="mt-1 w-full">
          Create account
        </Button>
      </form>
    </AuthLayout>
  );
}
