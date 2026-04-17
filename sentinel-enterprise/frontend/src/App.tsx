import { useEffect, useState } from "react";
import reactLogo from "./assets/react.svg";
import { invoke } from "@tauri-apps/api/core";
import {
  checkPiecesConnection,
  getRecentCodeSnippets,
  packageLocalContext,
} from "./lib/pieces";
import { runLocalCapture } from "./lib/captureLoop";
import { getLatestTelemetry, getTauriDb } from "./lib/localDb";
import "./App.css";

function App() {
  const [greetMsg, setGreetMsg] = useState("");
  const [name, setName] = useState("");

  useEffect(() => {
    const runPiecesHealthCheck = async () => {
      const status = await checkPiecesConnection();
      console.info("[Pieces OS] Connection status:", status);
    };

    void runPiecesHealthCheck();
  }, []);

  useEffect(() => {
    const runCapture = async () => {
      try {
        await runLocalCapture();
        console.info("[Capture Loop] Local capture written to sentinel-local.db");
      } catch (error) {
        console.error("[Capture Loop] Failed to run local capture", error);
      }
    };

    void runCapture();
    const intervalId = window.setInterval(() => {
      void runCapture();
    }, 5 * 60 * 1000);

    return () => window.clearInterval(intervalId);
  }, []);

  async function greet() {
    // Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
    setGreetMsg(await invoke("greet", { name }));
  }

  async function handleTestSnippets() {
    const snippets = await getRecentCodeSnippets();
    console.info("[Pieces OS] Recent code snippets:", snippets);
  }

  async function handleTestPayload() {
    const payload = await packageLocalContext(
      "Why is my API failing?",
      "feature/auth-update",
    );
    console.log(JSON.stringify(payload, null, 2));
  }

  async function handleForceSync() {
    console.info("[Force Sync] Button clicked");
    try {
      await runLocalCapture();

      // Raw Tauri SQL fallback — bypasses Drizzle entirely
      const tauriDb = await getTauriDb();
      const rawResult = await tauriDb.select<Record<string, unknown>[]>(
        "SELECT * FROM local_telemetry ORDER BY id DESC LIMIT 1",
      );
      console.info("[Raw Tauri SQL] Latest telemetry:", rawResult);

      // Drizzle path
      const latestTelemetry = await getLatestTelemetry();

      if (latestTelemetry?.codeSnippets) {
        const parsed = JSON.parse(latestTelemetry.codeSnippets) as string[];
        console.info("[Drizzle DB] Latest telemetry:", {
          ...latestTelemetry,
          codeSnippets: parsed,
        });
      } else {
        console.info("[Drizzle DB] Latest telemetry:", latestTelemetry);
      }
    } catch (error) {
      console.error("[Force Sync] Failed", error);
    }
  }

  return (
    <main className="container">
      <h1>Welcome to Tauri + React</h1>

      <div className="row">
        <a href="https://vite.dev" target="_blank">
          <img src="/vite.svg" className="logo vite" alt="Vite logo" />
        </a>
        <a href="https://tauri.app" target="_blank">
          <img src="/tauri.svg" className="logo tauri" alt="Tauri logo" />
        </a>
        <a href="https://react.dev" target="_blank">
          <img src={reactLogo} className="logo react" alt="React logo" />
        </a>
      </div>
      <p>Click on the Tauri, Vite, and React logos to learn more.</p>

      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          greet();
        }}
      >
        <input
          id="greet-input"
          onChange={(e) => setName(e.currentTarget.value)}
          placeholder="Enter a name..."
        />
       
        <button type="submit">Greet</button>
        <button type="button" onClick={handleTestSnippets}>
          Test Snippets
        </button>
        <button type="button" onClick={handleTestPayload}>
          Test Payload
        </button>
        <button type="button" onClick={handleForceSync}>
          Force Sync
        </button>
      </form>
      <p>{greetMsg}</p>
    </main>
  );
}

export default App;
