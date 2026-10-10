import Link from "next/link";
import { currentUser } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function LoginPage() {
  const user = await currentUser();
  if (user) {
    redirect("/");
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: "2rem",
      }}
    >
      <div style={{ textAlign: "center", maxWidth: 360 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo-white.svg"
          alt="Coppergate"
          width={72}
          height={68}
          style={{ marginBottom: "1.25rem" }}
        />
        <h1 style={{ margin: 0, fontSize: "1.75rem", fontWeight: 600 }}>
          Sign in
        </h1>
        <p style={{ marginTop: "0.75rem", color: "#A3A3A3", lineHeight: 1.5 }}>
          Continue with GitHub to open the gate. We only request identity scopes
          — repository access comes later via the GitHub App.
        </p>
        <a
          href="/api/auth/github"
          style={{
            display: "inline-block",
            marginTop: "1.75rem",
            padding: "0.75rem 1.25rem",
            background: "#FFFFFF",
            color: "#0A0A0A",
            textDecoration: "none",
            fontWeight: 600,
            borderRadius: 4,
          }}
        >
          Continue with GitHub
        </a>
        <p style={{ marginTop: "1.5rem" }}>
          <Link href="/" style={{ color: "#A3A3A3" }}>
            Back home
          </Link>
        </p>
      </div>
    </main>
  );
}
