import LynqPasswordForm from "./PasswordForm";

export default function LynqPasswordPage() {
  return <main className="dashboard-page max-w-lg">
    <h1 className="mb-3 text-2xl font-semibold">Set LYNQ password</h1>
    <p className="mb-6 text-sm text-muted">Set the shared password you and JB will use to sign in to LYNQ.</p>
    <LynqPasswordForm />
  </main>;
}
