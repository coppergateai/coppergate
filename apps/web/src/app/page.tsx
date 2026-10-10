export default function HomePage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: "2rem",
      }}
    >
      <div style={{ textAlign: "center" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo-white.svg"
          alt="Coppergate"
          width={96}
          height={91}
          style={{ marginBottom: "1.5rem" }}
        />
        <h1 style={{ margin: 0, fontSize: "2rem", fontWeight: 600 }}>
          Coppergate
        </h1>
        <p style={{ marginTop: "0.75rem", color: "#A3A3A3" }}>
          Build inside the gate. Ship when you open it.
        </p>
      </div>
    </main>
  );
}
