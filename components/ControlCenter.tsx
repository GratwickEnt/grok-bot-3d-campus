"use client";
// Pixel-art office (MIT, MyWestLord) is the view. Data, the private-link gate,
// and the webhook command path are unchanged: this file still reads /api/data
// and posts /api/send ({ items } or { kind: "refresh" }).
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { TZ } from "../lib/tz";
import { OFFICE_HTML } from "./office-html";

type Usage = { weeklyPct: number; reset: string; onDemandPct: number; period: string; byTeam: { label: string; pct: number }[]; topBots: { label: string; pct: number }[] };
type Pending = { id: string; what: string; since: string };
type Team = { id: string; name: string; lead?: { name?: string }; pending?: Pending[] };
export type DataShape = { UPDATED: string; USAGE: Usage; TEAMS: Team[] };
type DemoApi = { snapshot: () => DataShape; send: (items: string[]) => void; refreshRound: () => void; subscribe: (fn: () => void) => () => void };

const EMPTY: DataShape = { UPDATED: "", USAGE: { weeklyPct: 0, reset: "", onDemandPct: 0, period: "", byTeam: [], topBots: [] }, TEAMS: [] };

export default function ControlCenter(props: { initial: DataShape; demo?: DemoApi }) {
  const demo = props.demo || null;
  const [data, setData] = useState<DataShape>(() => (demo ? demo.snapshot() : (props.initial || EMPTY)));
  const [mounted, setMounted] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<"" | "new" | "same" | "error">("");
  const [reqAt, setReqAt] = useState(0);
  const [pollUntil, setPollUntil] = useState(0);
  const [now, setNow] = useState(0);
  const [open, setOpen] = useState(false);
  const [cmd, setCmd] = useState("");
  const [toast, setToast] = useState("");
  const [sending, setSending] = useState(false);
  const [decided, setDecided] = useState<Record<string, string>>({});
  const frameRef = useRef<HTMLIFrameElement>(null);
  const cur = useRef("");
  const stampAtReq = useRef("");
  const busyRef = useRef(false);
  const lastSend = useRef(0);
  const dataRef = useRef(data);
  dataRef.current = data;

  const push = (d: DataShape) => {
    const w = frameRef.current?.contentWindow as Window & { OFFICE?: { zone?: (z: string) => void; applyData?: (x: DataShape) => void } } | null;
    if (!w || !w.OFFICE || !w.OFFICE.applyData) return;
    try {
      w.OFFICE.zone?.(TZ);
      w.OFFICE.applyData(d);
    } catch (e) {}
  };

  const load = async (): Promise<"new" | "same" | "error"> => {
    if (demo) {
      const j = demo.snapshot();
      const txt = JSON.stringify(j);
      const changed = txt !== cur.current;
      cur.current = txt;
      setData(j);
      return changed ? "new" : "same";
    }
    try {
      const r = await fetch("/api/data?ts=" + Date.now(), { cache: "no-store", headers: { "Cache-Control": "no-cache" } });
      if (r.status === 401 || r.status === 404) return "error";
      if (r.ok) {
        const j = await r.json();
        if (j && Array.isArray(j.TEAMS)) {
          const txt = JSON.stringify(j);
          const changed = txt !== cur.current;
          cur.current = txt;
          setData(j);
          return changed ? "new" : "same";
        }
      }
    } catch (e) {}
    return "error";
  };

  useEffect(() => {
    setMounted(true);
    cur.current = JSON.stringify(demo ? demo.snapshot() : props.initial);
    if (demo) {
      setData(demo.snapshot());
      const off = demo.subscribe(() => {
        const j = demo.snapshot();
        cur.current = JSON.stringify(j);
        setData(j);
      });
      const id = setInterval(load, 60000);
      return () => { off(); clearInterval(id); };
    }
    try {
      const v = Number(localStorage.getItem("ccRefreshReq") || 0);
      if (v > Date.now() - 5 * 60000) setReqAt(v);
    } catch (e) {}
    const id = setInterval(load, 60000);
    const vis = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", vis);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", vis); };
  }, []);

  useEffect(() => {
    if (!pollUntil || demo) return;
    const id = setInterval(async () => {
      try {
        const r = await fetch("/api/data?ts=" + Date.now(), { cache: "no-store" });
        if (r.ok) {
          const j = await r.json();
          if (j && Array.isArray(j.TEAMS)) {
            cur.current = JSON.stringify(j);
            setData(j);
            if (j.UPDATED !== stampAtReq.current) { setPollUntil(0); setResult("new"); return; }
          }
        }
      } catch (e) {}
      if (Date.now() > pollUntil) setPollUntil(0);
    }, 20000);
    return () => clearInterval(id);
  }, [pollUntil]);

  useEffect(() => {
    if (!mounted) return;
    push(data);
  }, [data, mounted]);

  useEffect(() => {
    if (!reqAt && !pollUntil) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [reqAt, pollUntil]);

  const remember = (v: number) => {
    setReqAt(v);
    try { localStorage.setItem("ccRefreshReq", String(v)); } catch (e) {}
  };

  const refresh = async () => {
    if (busyRef.current) return;
    if (demo) {
      if (pollUntil) return;
      busyRef.current = true; setBusy(true);
      const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
      await pause(700); await load();
      busyRef.current = false; setBusy(false);
      setReqAt(Date.now()); setPollUntil(Date.now() + 6 * 60000);
      await pause(2200); setNote("The bot is reading the team chats…");
      await pause(3600); setNote("Updating the page…");
      await pause(1400);
      demo.refreshRound(); await load();
      setNote(""); setPollUntil(0); setReqAt(0); setResult("new");
      return;
    }
    busyRef.current = true; setBusy(true);
    const t0 = Date.now();
    const res = await load();
    setResult(res);
    if (Date.now() - reqAt >= 5 * 60000) {
      try {
        const r = await fetch("/api/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "refresh" }) });
        const j = await r.json().catch(() => ({}));
        if (r.ok && j.ok) { remember(Number(j.at) || Date.now()); stampAtReq.current = dataRef.current.UPDATED; setPollUntil(Date.now() + 6 * 60000); }
        else if (j.limited) remember(Number(j.at) || Date.now() - (5 * 60000 - (Number(j.waitMs) || 0)));
        else if (j.error) setNote(String(j.error));
      } catch (e) {}
    }
    const left = 600 - (Date.now() - t0);
    if (left > 0) await new Promise((r) => setTimeout(r, left));
    busyRef.current = false; setBusy(false);
  };

  const postItems = async (items: string[]) => {
    if (!items.length || sending) return;
    const wait = 5000 - (Date.now() - lastSend.current);
    if (wait > 0) { setToast(`You can send again in ${Math.ceil(wait / 1000)} seconds`); return; }
    lastSend.current = Date.now();
    setSending(true);
    const shown = items.join("\n");
    if (demo) {
      await new Promise((r) => setTimeout(r, 650));
      demo.send(items);
      setToast("Sent to the bot (demo — nothing left this browser)\n" + shown);
      setSending(false);
      return;
    }
    try {
      const r = await fetch("/api/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items }) });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j.ok) { setToast("Sent to the bot\n" + shown); setSending(false); return; }
      setToast(j.error || `Could not send (${r.status})`);
    } catch (e) {
      setToast("No connection to the server");
    }
    setSending(false);
  };

  const pending: { team: string; item: Pending }[] = [];
  (data.TEAMS || []).forEach((tm) => {
    (tm.pending || []).forEach((item) => { if (item && item.id && !decided[item.id]) pending.push({ team: tm.name, item }); });
  });

  const waiting = pollUntil > Date.now();
  const again = reqAt ? Math.max(0, reqAt + 5 * 60000 - (now || Date.now())) : 0;
  const status = note
    ? note
    : busy
      ? "Reading the latest data…"
      : waiting
        ? `Refresh request sent · waiting for data · again in ${Math.floor(again / 60000)}:${String(Math.floor((again % 60000) / 1000)).padStart(2, "0")}`
        : result === "new"
          ? "New data loaded"
          : result === "error"
            ? "Could not load data"
            : data.UPDATED
              ? "Data from " + data.UPDATED
              : "No data yet";

  if (!mounted) return <div style={{ height: "100dvh", background: "#05070c" }} />;

  const barBtn: CSSProperties = {
    font: "inherit", fontSize: 13, fontWeight: 650, color: "#fcf6ec", background: "#222942",
    border: "1px solid #2c3552", borderRadius: 999, padding: "5px 12px", cursor: "pointer",
  };

  return (
    <div style={{ height: "100dvh", display: "flex", flexDirection: "column", background: "#05070c", color: "#fcf6ec", fontFamily: "system-ui, sans-serif" }}>
      <header style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", padding: "8px 12px", background: "#0c1220", borderBottom: "1px solid #e8b04b" }}>
        <strong style={{ letterSpacing: 0.4 }}>Gratwick</strong>
        <span style={{ fontSize: 12.5, color: "#b5a88a", flex: "1 1 180px" }}>{status}</span>
        <button type="button" onClick={refresh} disabled={busy} style={barBtn}>{busy ? "Refreshing…" : "Refresh"}</button>
        <button type="button" onClick={() => setOpen((v) => !v)} style={barBtn}>Approvals ({pending.length})</button>
        <form
          onSubmit={(e) => { e.preventDefault(); const t = cmd.trim(); if (!t) return; setCmd(""); postItems([t]); }}
          style={{ display: "flex", gap: 6, flex: "1 1 240px" }}
        >
          <input
            value={cmd}
            onChange={(e) => setCmd(e.target.value)}
            placeholder="Command to the bot"
            aria-label="Command to the bot"
            style={{ flex: 1, minWidth: 0, font: "inherit", fontSize: 13, padding: "6px 10px", borderRadius: 999, border: "1px solid #2c3552", background: "#141414", color: "#fcf6ec" }}
          />
          <button type="submit" disabled={sending || !cmd.trim()} style={barBtn}>{sending ? "Sending…" : "Send"}</button>
        </form>
      </header>
      <div style={{ flex: 1, position: "relative", minHeight: 0 }}>
        <iframe
          ref={frameRef}
          title="Gratwick office"
          srcDoc={OFFICE_HTML}
          onLoad={() => { push(dataRef.current); }}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: 0, background: "#05070c" }}
        />
        {open && (
          <aside style={{ position: "absolute", top: 8, right: 8, width: "min(420px, calc(100% - 16px))", maxHeight: "calc(100% - 16px)", overflow: "auto", background: "#0c1220", border: "1px solid #e8b04b", borderRadius: 12, padding: 12, zIndex: 2 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <strong>Waiting for you</strong>
              <button type="button" onClick={() => setOpen(false)} style={barBtn}>Close</button>
            </div>
            {pending.length === 0 && <div style={{ color: "#b5a88a", fontSize: 14 }}>No approvals in the feed.</div>}
            {pending.map(({ team, item }) => {
              const base = `${team}: ${item.what} [${item.id}]`;
              return (
                <div key={item.id} style={{ borderTop: "1px solid #2c3552", padding: "10px 0" }}>
                  <div style={{ fontSize: 12, color: "#b5a88a" }}>{team}{item.since ? ` · since ${item.since}` : ""}</div>
                  <div style={{ fontSize: 14, margin: "4px 0 8px" }}>{item.what}</div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <button type="button" style={barBtn} onClick={() => { setDecided((d) => ({ ...d, [item.id]: "approve" })); postItems([`Approved — ${base}`]); }}>Approve</button>
                    <button type="button" style={barBtn} onClick={() => { setDecided((d) => ({ ...d, [item.id]: "reject" })); postItems([`Rejected — ${base}`]); }}>Reject</button>
                    <button type="button" style={barBtn} onClick={() => { const q = window.prompt("Question for the bot") || ""; setDecided((d) => ({ ...d, [item.id]: "ask" })); postItems([`Question — ${base} — ${q || "(no breakdown)"}`]); }}>Ask</button>
                  </div>
                </div>
              );
            })}
          </aside>
        )}
        {toast && (
          <div role="status" style={{ position: "absolute", left: "50%", bottom: 12, transform: "translateX(-50%)", maxWidth: "min(560px, 92%)", background: "#0c1220", border: "1px solid #2b8f5c", borderRadius: 12, padding: "8px 12px", fontSize: 13, whiteSpace: "pre-wrap", zIndex: 3 }}>
            {toast}
            <button type="button" onClick={() => setToast("")} style={{ ...barBtn, marginLeft: 8 }}>OK</button>
          </div>
        )}
      </div>
    </div>
  );
}
