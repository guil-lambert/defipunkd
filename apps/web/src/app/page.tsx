import { listProtocols } from "@defibeat/registry";

export default function HomePage() {
  const protocols = listProtocols();
  return (
    <main style={{ padding: "2rem" }}>
      <h1 style={{ color: "#22d3ee" }}>DefiBeat</h1>
      <p>{protocols.length} protocols indexed.</p>
    </main>
  );
}
