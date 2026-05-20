import { useState, useMemo, useEffect, useCallback } from "react";
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  RadarChart, Radar, PolarGrid, PolarAngleAxis,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  AreaChart, Area, Legend
} from "recharts";

// ─── CONSTANTS ───────────────────────────────────────────────────────────────
const SECTOR_COLORS = {
  "IT": "#00d4ff", "Banking & Finance": "#f59e0b", "FMCG": "#10b981",
  "Pharma": "#a78bfa", "Auto": "#f43f5e", "Energy": "#fb923c",
  "Metals & Mining": "#94a3b8", "Infrastructure": "#06b6d4",
  "Telecom": "#e879f9", "Real Estate": "#34d399",
  "Consumer Durables": "#fbbf24", "Chemicals": "#ec4899", "Other": "#475569",
};
const CAP_COLORS = { "Large Cap": "#00d4ff", "Mid Cap": "#f59e0b", "Small Cap": "#f43f5e" };
const SECTORS = Object.keys(SECTOR_COLORS);
const CAPS = ["Large Cap", "Mid Cap", "Small Cap"];

const NIFTY_BENCHMARK = { ytd: 14.2, oneYear: 18.7, threeYear: 15.3 };

const SAMPLE = [
  { name: "Reliance Industries", ticker: "RELIANCE", sector: "Energy", qty: 10, avgBuy: 2400, cmp: 2850, cap: "Large Cap", buyDate: "2023-03-15", type: "Stock" },
  { name: "Infosys", ticker: "INFY", sector: "IT", qty: 15, avgBuy: 1450, cmp: 1620, cap: "Large Cap", buyDate: "2022-11-10", type: "Stock" },
  { name: "HDFC Bank", ticker: "HDFCBANK", sector: "Banking & Finance", qty: 20, avgBuy: 1550, cmp: 1680, cap: "Large Cap", buyDate: "2023-07-01", type: "Stock" },
  { name: "TCS", ticker: "TCS", sector: "IT", qty: 5, avgBuy: 3600, cmp: 3900, cap: "Large Cap", buyDate: "2022-06-20", type: "Stock" },
  { name: "Asian Paints", ticker: "ASIANPAINT", sector: "FMCG", qty: 8, avgBuy: 3200, cmp: 2980, cap: "Large Cap", buyDate: "2023-01-05", type: "Stock" },
  { name: "Sun Pharma", ticker: "SUNPHARMA", sector: "Pharma", qty: 25, avgBuy: 1100, cmp: 1340, cap: "Large Cap", buyDate: "2021-09-12", type: "Stock" },
  { name: "Tata Motors", ticker: "TATAMOTORS", sector: "Auto", qty: 30, avgBuy: 620, cmp: 780, cap: "Large Cap", buyDate: "2023-04-18", type: "Stock" },
  { name: "Zomato", ticker: "ZOMATO", sector: "Other", qty: 100, avgBuy: 72, cmp: 195, cap: "Mid Cap", buyDate: "2022-08-30", type: "Stock" },
  { name: "Mirae Asset Large Cap", ticker: "MIRAE-LC", sector: "IT", qty: 500, avgBuy: 82, cmp: 98, cap: "Large Cap", buyDate: "2022-01-10", type: "Mutual Fund" },
  { name: "Parag Parikh Flexi Cap", ticker: "PPFCF", sector: "Banking & Finance", qty: 200, avgBuy: 55, cmp: 71, cap: "Mid Cap", buyDate: "2021-06-15", type: "Mutual Fund" },
];

const ZERODHA_MAP = { "Instrument": "ticker", "Qty.": "qty", "Avg. cost": "avgBuy", "LTP": "cmp" };
const GROWW_MAP = { "Symbol": "ticker", "Quantity": "qty", "Average Price": "avgBuy", "Current Price": "cmp" };

// ─── HELPERS ─────────────────────────────────────────────────────────────────
const fmt = n => new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(n || 0);
const fmtD = n => new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(n || 0);
const pct = n => (n >= 0 ? "+" : "") + (n || 0).toFixed(2) + "%";
const daysBetween = (d1, d2) => Math.floor((new Date(d2) - new Date(d1)) / 86400000);
const TODAY = new Date().toISOString().split("T")[0];

function computeHolding(h) {
  const invested = h.qty * h.avgBuy;
  const current = h.qty * h.cmp;
  const pnl = current - invested;
  const pnlPct = invested ? (pnl / invested) * 100 : 0;
  const days = daysBetween(h.buyDate || "2022-01-01", TODAY);
  const isLTCG = days >= 365;
  const taxableGain = Math.max(0, pnl);
  const tax = isLTCG ? Math.max(0, taxableGain - 100000) * 0.10 : taxableGain * 0.15;
  return { ...h, invested, current, pnl, pnlPct, days, isLTCG, tax };
}

function computeScore(rows, totalCurrent) {
  if (!rows.length) return { total: 0, diversification: 0, risk: 0, returns: 0, balance: 0 };
  const sectorMap = {};
  rows.forEach(r => { sectorMap[r.sector] = (sectorMap[r.sector] || 0) + r.current; });
  const sectorPcts = Object.values(sectorMap).map(v => (v / totalCurrent) * 100);
  const maxSector = Math.max(...sectorPcts);
  const numSectors = Object.keys(sectorMap).length;
  const topStock = Math.max(...rows.map(r => (r.current / totalCurrent) * 100));
  const top3 = [...rows].sort((a, b) => b.current - a.current).slice(0, 3).reduce((a, r) => a + (r.current / totalCurrent) * 100, 0);
  const avgReturn = rows.reduce((a, r) => a + r.pnlPct * (r.current / totalCurrent), 0);
  const largePct = rows.filter(r => r.cap === "Large Cap").reduce((a, r) => a + r.current / totalCurrent * 100, 0);
  const midPct = rows.filter(r => r.cap === "Mid Cap").reduce((a, r) => a + r.current / totalCurrent * 100, 0);
  const smallPct = rows.filter(r => r.cap === "Small Cap").reduce((a, r) => a + r.current / totalCurrent * 100, 0);

  const diversification = Math.min(100, Math.round(
    (numSectors >= 6 ? 40 : numSectors * 6.5) +
    (maxSector < 25 ? 30 : maxSector < 35 ? 18 : 8) +
    (topStock < 20 ? 30 : topStock < 30 ? 18 : 8)
  ));
  const risk = Math.min(100, Math.round(
    (top3 < 45 ? 40 : top3 < 60 ? 25 : 10) +
    (maxSector < 30 ? 35 : maxSector < 45 ? 20 : 8) +
    (smallPct < 20 ? 25 : smallPct < 35 ? 15 : 5)
  ));
  const returns = Math.min(100, Math.round(
    (avgReturn > 20 ? 50 : avgReturn > 10 ? 35 : avgReturn > 0 ? 20 : 5) +
    (avgReturn > NIFTY_BENCHMARK.oneYear ? 50 : 25)
  ));
  const balance = Math.min(100, Math.round(
    (largePct >= 50 && largePct <= 75 ? 40 : 20) +
    (midPct >= 15 && midPct <= 35 ? 30 : 15) +
    (smallPct <= 20 ? 30 : 15)
  ));
  const total = Math.round(diversification * 0.3 + risk * 0.3 + returns * 0.25 + balance * 0.15);
  return { total, diversification, risk, returns, balance };
}

// ─── SUB-COMPONENTS ──────────────────────────────────────────────────────────
const Tag = ({ children, color }) => (
  <span style={{ background: color + "22", color, padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600 }}>{children}</span>
);

const Card = ({ children, style = {} }) => (
  <div style={{ background: "#061020", border: "1px solid #0e2340", borderRadius: 14, padding: "22px 24px", ...style }}>{children}</div>
);

const SectionTitle = ({ children }) => (
  <p style={{ margin: "0 0 16px", color: "#4a7fa5", fontSize: 11, fontWeight: 600, letterSpacing: "1.5px", textTransform: "uppercase", fontFamily: "'DM Mono', monospace" }}>{children}</p>
);

const StatChip = ({ label, value, color = "#00d4ff", sub }) => (
  <div style={{ background: "#040e1e", border: "1px solid #0e2340", borderRadius: 10, padding: "16px 18px" }}>
    <p style={{ margin: "0 0 6px", color: "#4a7fa5", fontSize: 11, fontWeight: 500, letterSpacing: "0.5px", textTransform: "uppercase" }}>{label}</p>
    <p style={{ margin: 0, fontSize: 22, fontWeight: 700, color, fontFamily: "'Syne', sans-serif" }}>{value}</p>
    {sub && <p style={{ margin: "4px 0 0", color: "#2a4a6a", fontSize: 11 }}>{sub}</p>}
  </div>
);

function ScoreGauge({ score }) {
  const color = score >= 75 ? "#10b981" : score >= 50 ? "#f59e0b" : "#f43f5e";
  const label = score >= 75 ? "Strong" : score >= 50 ? "Moderate" : "Needs Work";
  const r = 70, circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ * 0.75;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
      <svg width={180} height={130} viewBox="0 0 180 130">
        <defs>
          <linearGradient id="gaugeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={color} stopOpacity="0.3" />
            <stop offset="100%" stopColor={color} />
          </linearGradient>
        </defs>
        <circle cx={90} cy={100} r={r} fill="none" stroke="#0e2340" strokeWidth={14} strokeDasharray={`${circ * 0.75} ${circ}`} strokeDashoffset={circ * 0.125} strokeLinecap="round" transform="rotate(0)" />
        <circle cx={90} cy={100} r={r} fill="none" stroke="url(#gaugeGrad)" strokeWidth={14} strokeDasharray={`${dash} ${circ}`} strokeDashoffset={circ * 0.125} strokeLinecap="round" style={{ transition: "stroke-dasharray 1s ease" }} />
        <text x={90} y={95} textAnchor="middle" fill={color} fontSize={36} fontWeight={800} fontFamily="'Syne', sans-serif">{score}</text>
        <text x={90} y={118} textAnchor="middle" fill={color} fontSize={13} fontFamily="'DM Sans', sans-serif" fontWeight={600}>{label}</text>
      </svg>
      <p style={{ color: "#2a4a6a", fontSize: 11, textAlign: "center" }}>Portfolio Health Score · Industry avg: 62</p>
    </div>
  );
}

function AIPanel({ rows, stats, score }) {
  const [response, setResponse] = useState("");
  const [loading, setLoading] = useState(false);
  const [asked, setAsked] = useState(false);

  const analyze = async () => {
    setLoading(true); setAsked(true); setResponse("");
    const summary = {
      holdings: rows.map(r => ({ name: r.name, sector: r.sector, cap: r.cap, pnlPct: r.pnlPct.toFixed(1), weight: ((r.current / stats.totalCurrent) * 100).toFixed(1) + "%" })),
      score, totalInvested: fmt(stats.totalInvested), totalCurrent: fmt(stats.totalCurrent),
      overallPnlPct: stats.totalPnlPct.toFixed(2),
      topSector: stats.sectorData[0]?.name, topSectorPct: stats.sectorData[0]?.pct.toFixed(1),
      numSectors: stats.sectorData.length,
    };
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          system: `You are a SEBI-registered investment advisor specializing in Indian equity markets. Analyze portfolios and give crisp, specific, actionable advice. Always reference actual stock/sector names from the data. Format your response with these exact sections using emoji headers:
🎯 Portfolio Summary (2 lines max)
⚠️ Key Risks (bullet points, be specific)
✅ What's Working (bullet points)
🔄 Immediate Actions (3 specific stocks/sectors to act on, with reasoning)
📈 Growth Opportunities (what sectors/themes to add)
Always end with a one-line disclaimer. Be direct, specific, not generic.`,
          messages: [{ role: "user", content: `Analyze this Indian stock portfolio and give me specific actionable advice:\n${JSON.stringify(summary, null, 2)}` }]
        })
      });
      const data = await res.json();
      setResponse(data.content?.[0]?.text || "Unable to generate analysis.");
    } catch { setResponse("⚠️ AI analysis unavailable. Check your connection."); }
    setLoading(false);
  };

  return (
    <Card>
      <SectionTitle>AI Portfolio Intelligence</SectionTitle>
      {!asked ? (
        <div style={{ textAlign: "center", padding: "24px 0" }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🤖</div>
          <p style={{ color: "#4a7fa5", fontSize: 14, marginBottom: 20, lineHeight: 1.6 }}>Get Claude-powered analysis of your portfolio — specific stocks to remove, sectors to add, and personalized risk assessment.</p>
          <button onClick={analyze} style={{ background: "linear-gradient(135deg, #0070f3, #00d4ff)", border: "none", borderRadius: 10, padding: "12px 28px", color: "#fff", fontWeight: 700, fontSize: 15, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>
            Analyze My Portfolio
          </button>
        </div>
      ) : loading ? (
        <div style={{ textAlign: "center", padding: "32px 0" }}>
          <div style={{ display: "flex", gap: 6, justifyContent: "center", marginBottom: 12 }}>
            {[0, 1, 2].map(i => <div key={i} style={{ width: 8, height: 8, borderRadius: "50%", background: "#00d4ff", animation: `pulse 1.2s ${i * 0.2}s infinite`, opacity: 0.7 }} />)}
          </div>
          <p style={{ color: "#4a7fa5", fontSize: 13 }}>Analyzing your portfolio…</p>
          <style>{`@keyframes pulse { 0%,100%{transform:scale(1);opacity:0.4} 50%{transform:scale(1.4);opacity:1} }`}</style>
        </div>
      ) : (
        <div>
          <div style={{ whiteSpace: "pre-wrap", color: "#94a3b8", fontSize: 13, lineHeight: 1.8, fontFamily: "'DM Sans', sans-serif" }}>{response}</div>
          <button onClick={analyze} style={{ marginTop: 16, background: "#0e2340", border: "1px solid #1e3a5f", borderRadius: 8, padding: "8px 16px", color: "#4a7fa5", fontSize: 12, cursor: "pointer" }}>Re-analyze</button>
        </div>
      )}
    </Card>
  );
}

// ─── IMPORT SCREEN ────────────────────────────────────────────────────────────
function ImportScreen({ onImport, onSample }) {
  const [pasteText, setPasteText] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("upload");

  const parseCSV = (text) => {
    const lines = text.trim().split("\n").filter(l => l.trim());
    if (lines.length < 2) return null;
    const headers = lines[0].split(",").map(h => h.trim().replace(/"/g, ""));

    // Detect broker format
    let map = {};
    if (headers.includes("Instrument")) map = ZERODHA_MAP;
    else if (headers.includes("Symbol") && headers.includes("Average Price")) map = GROWW_MAP;
    else {
      // Generic: try to find columns
      const tryMap = (h) => headers.find(x => x.toLowerCase().includes(h));
      const tiker = tryMap("symbol") || tryMap("ticker") || tryMap("stock") || tryMap("instrument");
      const qty = tryMap("qty") || tryMap("quantity") || tryMap("shares");
      const avg = tryMap("avg") || tryMap("average") || tryMap("cost") || tryMap("buy");
      const cmp = tryMap("ltp") || tryMap("current") || tryMap("price") || tryMap("cmp");
      if (tiker) map[tiker] = "ticker";
      if (qty) map[qty] = "qty";
      if (avg) map[avg] = "avgBuy";
      if (cmp) map[cmp] = "cmp";
    }

    const rows = [];
    for (let i = 1; i < lines.length; i++) {
      const vals = lines[i].split(",").map(v => v.trim().replace(/"/g, ""));
      const obj = {};
      headers.forEach((h, idx) => { if (map[h]) obj[map[h]] = vals[idx]; });
      if (obj.ticker && obj.qty && obj.avgBuy) {
        rows.push({
          name: obj.ticker,
          ticker: obj.ticker,
          sector: "Other",
          qty: parseFloat(obj.qty) || 0,
          avgBuy: parseFloat(obj.avgBuy) || 0,
          cmp: parseFloat(obj.cmp) || parseFloat(obj.avgBuy) || 0,
          cap: "Large Cap",
          buyDate: "2023-01-01",
          type: "Stock"
        });
      }
    }
    return rows.length ? rows : null;
  };

  const handleFile = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const rows = parseCSV(e.target.result);
      if (rows) { onImport(rows); }
      else setError("Could not parse this file. Try Zerodha/Groww CSV export or paste your data below.");
    };
    reader.readAsText(file);
  };

  const handlePaste = () => {
    const rows = parseCSV(pasteText);
    if (rows) onImport(rows);
    else setError("Couldn't parse the pasted data. Make sure it has headers and comma-separated values.");
  };

  return (
    <div style={{ minHeight: "100vh", background: "#020c1b", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 32, fontFamily: "'DM Sans', sans-serif" }}>
      <style>{`@keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}`}</style>

      {/* Logo */}
      <div style={{ textAlign: "center", marginBottom: 40 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: "center", marginBottom: 8 }}>
          <div style={{ width: 6, height: 40, background: "linear-gradient(180deg, #00d4ff, #0070f3)", borderRadius: 3 }} />
          <h1 style={{ fontFamily: "'Syne', sans-serif", fontSize: 32, fontWeight: 800, color: "#f0f9ff", margin: 0, letterSpacing: "-1px" }}>
            Stocks <span style={{ color: "#00d4ff" }}>Scanner</span>
          </h1>
        </div>
        <p style={{ color: "#2a4a6a", fontSize: 14 }}>Advanced Portfolio Intelligence for Indian Investors</p>
      </div>

      <div style={{ width: "100%", maxWidth: 640 }}>
        {/* Tabs */}
        <div style={{ display: "flex", gap: 4, background: "#040e1e", borderRadius: 10, padding: 4, marginBottom: 20, border: "1px solid #0e2340" }}>
          {[["upload", "📁 Upload CSV"], ["paste", "📋 Paste Data"], ["manual", "✍️ Manual Entry"]].map(([v, l]) => (
            <button key={v} onClick={() => setTab(v)} style={{ flex: 1, padding: "10px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600, background: tab === v ? "#0070f3" : "transparent", color: tab === v ? "#fff" : "#4a7fa5", transition: "all 0.2s", fontFamily: "'DM Sans', sans-serif" }}>{l}</button>
          ))}
        </div>

        {tab === "upload" && (
          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]); }}
            style={{ border: `2px dashed ${dragOver ? "#00d4ff" : "#0e2340"}`, borderRadius: 14, padding: "48px 32px", textAlign: "center", background: dragOver ? "#040e1e" : "transparent", transition: "all 0.2s", cursor: "pointer" }}
            onClick={() => document.getElementById("csvInput").click()}
          >
            <input id="csvInput" type="file" accept=".csv,.xlsx,.xls" style={{ display: "none" }} onChange={e => handleFile(e.target.files[0])} />
            <div style={{ fontSize: 48, marginBottom: 12, animation: "float 3s ease-in-out infinite" }}>📂</div>
            <p style={{ color: "#94a3b8", fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Drop your broker CSV here</p>
            <p style={{ color: "#2a4a6a", fontSize: 13, lineHeight: 1.6 }}>Works with Zerodha · Groww · Upstox · Angel One · ICICI Direct · HDFC Securities</p>
            <p style={{ color: "#1e3a5f", fontSize: 12, marginTop: 12 }}>Export from your broker → Holdings → Download CSV</p>
          </div>
        )}

        {tab === "paste" && (
          <div>
            <p style={{ color: "#4a7fa5", fontSize: 13, marginBottom: 10 }}>Paste CSV data directly — include the header row. Works with any comma-separated broker export.</p>
            <textarea
              value={pasteText}
              onChange={e => setPasteText(e.target.value)}
              placeholder={"Instrument,Qty.,Avg. cost,LTP\nRELIANCE,10,2400,2850\nINFY,15,1450,1620"}
              style={{ width: "100%", height: 180, background: "#040e1e", border: "1px solid #0e2340", borderRadius: 10, padding: "14px 16px", color: "#94a3b8", fontSize: 12, fontFamily: "'DM Mono', monospace", outline: "none", resize: "vertical" }}
            />
            <button onClick={handlePaste} style={{ marginTop: 12, width: "100%", padding: "13px", background: "linear-gradient(135deg, #0070f3, #00d4ff)", border: "none", borderRadius: 10, color: "#fff", fontWeight: 700, fontSize: 15, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>
              Import Portfolio →
            </button>
          </div>
        )}

        {tab === "manual" && (
          <div style={{ textAlign: "center", padding: "32px 0" }}>
            <p style={{ color: "#4a7fa5", fontSize: 14, marginBottom: 20, lineHeight: 1.6 }}>You'll be able to add stocks one by one inside the tool after loading sample data.</p>
            <button onClick={onSample} style={{ padding: "13px 32px", background: "linear-gradient(135deg, #0070f3, #00d4ff)", border: "none", borderRadius: 10, color: "#fff", fontWeight: 700, fontSize: 15, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>
              Load Sample Portfolio →
            </button>
          </div>
        )}

        {error && <p style={{ color: "#f43f5e", fontSize: 13, marginTop: 12, textAlign: "center" }}>{error}</p>}

        <div style={{ textAlign: "center", marginTop: 20 }}>
          <button onClick={onSample} style={{ background: "none", border: "none", color: "#2a4a6a", fontSize: 13, cursor: "pointer", textDecoration: "underline" }}>
            Try with sample Indian portfolio
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function StocksScanner() {
  const [screen, setScreen] = useState("import"); // import | app
  const [activeTab, setActiveTab] = useState("overview");
  const [holdings, setHoldings] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [newRow, setNewRow] = useState({ name: "", ticker: "", sector: "IT", qty: "", avgBuy: "", cmp: "", cap: "Large Cap", buyDate: "", type: "Stock" });
  const [goalForm, setGoalForm] = useState({ name: "Retirement", target: 10000000, years: 20, monthly: 25000 });

  const rows = useMemo(() => holdings.map(computeHolding), [holdings]);

  const stats = useMemo(() => {
    const totalInvested = rows.reduce((a, r) => a + r.invested, 0);
    const totalCurrent = rows.reduce((a, r) => a + r.current, 0);
    const totalPnl = totalCurrent - totalInvested;
    const totalPnlPct = totalInvested ? (totalPnl / totalInvested) * 100 : 0;
    const totalTax = rows.reduce((a, r) => a + r.tax, 0);
    const stcgTax = rows.filter(r => !r.isLTCG).reduce((a, r) => a + r.tax, 0);
    const ltcgTax = rows.filter(r => r.isLTCG).reduce((a, r) => a + r.tax, 0);

    const sectorMap = {};
    rows.forEach(r => { sectorMap[r.sector] = (sectorMap[r.sector] || 0) + r.current; });
    const sectorData = Object.entries(sectorMap).map(([name, value]) => ({ name, value, pct: totalCurrent ? (value / totalCurrent) * 100 : 0 })).sort((a, b) => b.value - a.value);

    const capMap = {};
    rows.forEach(r => { capMap[r.cap] = (capMap[r.cap] || 0) + r.current; });
    const capData = Object.entries(capMap).map(([name, value]) => ({ name, value, pct: totalCurrent ? (value / totalCurrent) * 100 : 0 }));

    const stockRows = rows.filter(r => r.type === "Stock");
    const mfRows = rows.filter(r => r.type === "Mutual Fund");

    return { totalInvested, totalCurrent, totalPnl, totalPnlPct, totalTax, stcgTax, ltcgTax, sectorData, capData, stockRows, mfRows };
  }, [rows]);

  const score = useMemo(() => computeScore(rows, stats.totalCurrent), [rows, stats.totalCurrent]);

  const radarData = [
    { subject: "Diversification", value: score.diversification, benchmark: 65 },
    { subject: "Risk Control", value: score.risk, benchmark: 60 },
    { subject: "Returns", value: score.returns, benchmark: 55 },
    { subject: "Cap Balance", value: score.balance, benchmark: 70 },
  ];

  const goalProjection = useMemo(() => {
    const r = 0.12 / 12;
    const n = goalForm.years * 12;
    const fv = goalForm.monthly * ((Math.pow(1 + r, n) - 1) / r) * (1 + r);
    const current = stats.totalCurrent;
    const projected = current * Math.pow(1.12, goalForm.years) + fv;
    const gap = goalForm.target - projected;
    const chartData = Array.from({ length: goalForm.years + 1 }, (_, i) => ({
      year: `Y${i}`,
      projected: Math.round(current * Math.pow(1.12, i) + goalForm.monthly * 12 * i * 1.06),
      target: Math.round(goalForm.target * (i / goalForm.years)),
    }));
    return { fv, projected, gap, chartData, onTrack: projected >= goalForm.target };
  }, [goalForm, stats.totalCurrent]);

  const addHolding = () => {
    if (!newRow.name || !newRow.qty || !newRow.avgBuy || !newRow.cmp) return;
    setHoldings(p => [...p, { ...newRow, qty: +newRow.qty, avgBuy: +newRow.avgBuy, cmp: +newRow.cmp }]);
    setNewRow({ name: "", ticker: "", sector: "IT", qty: "", avgBuy: "", cmp: "", cap: "Large Cap", buyDate: "", type: "Stock" });
    setShowAdd(false);
  };

  const inputStyle = { width: "100%", background: "#040e1e", border: "1px solid #0e2340", borderRadius: 8, padding: "9px 12px", color: "#94a3b8", fontSize: 13, outline: "none", fontFamily: "'DM Sans', sans-serif" };
  const labelStyle = { display: "block", color: "#2a4a6a", fontSize: 11, fontWeight: 600, letterSpacing: "0.5px", textTransform: "uppercase", marginBottom: 5 };

  if (screen === "import") return <ImportScreen onImport={d => { setHoldings(d); setScreen("app"); }} onSample={() => { setHoldings(SAMPLE); setScreen("app"); }} />;

  const TABS = [
    { id: "overview", label: "Overview" },
    { id: "score", label: "Score" },
    { id: "holdings", label: "Holdings" },
    { id: "tax", label: "Tax P&L" },
    { id: "goals", label: "Goals" },
    { id: "ai", label: "AI Insights" },
  ];

  return (
    <div style={{ minHeight: "100vh", background: "#020c1b", color: "#f0f9ff", fontFamily: "'DM Sans', sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@600;700;800&family=DM+Mono:wght@400;500&family=DM+Sans:wght@300;400;500;600&display=swap');
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-track { background: #020c1b; }
        ::-webkit-scrollbar-thumb { background: #1e3a5f; border-radius: 4px; }
        input:focus, select:focus, textarea:focus { border-color: #0070f3 !important; }
        @keyframes fadeIn { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        .fade { animation: fadeIn 0.3s ease; }
        @keyframes pulse{0%,100%{transform:scale(1);opacity:0.4}50%{transform:scale(1.4);opacity:1}}
        tr:hover td { background: #040e1e; }
      `}</style>

      {/* ── NAVBAR ── */}
      <div style={{ background: "#040e1e", borderBottom: "1px solid #0e2340", padding: "0 28px", display: "flex", alignItems: "center", justifyContent: "space-between", height: 58, position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 4, height: 28, background: "linear-gradient(180deg,#00d4ff,#0070f3)", borderRadius: 2 }} />
          <span style={{ fontFamily: "'Syne',sans-serif", fontSize: 18, fontWeight: 800, letterSpacing: "-0.5px" }}>Stocks <span style={{ color: "#00d4ff" }}>Scanner</span></span>
        </div>
        <div style={{ display: "flex", gap: 2 }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)} style={{ padding: "6px 14px", borderRadius: 7, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 500, background: activeTab === t.id ? "#0e2340" : "transparent", color: activeTab === t.id ? "#00d4ff" : "#4a7fa5", transition: "all 0.15s", fontFamily: "'DM Sans',sans-serif" }}>{t.label}</button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => setShowAdd(p => !p)} style={{ padding: "7px 14px", borderRadius: 8, border: "1px solid #0e2340", background: "#040e1e", color: "#4a7fa5", fontSize: 13, cursor: "pointer" }}>+ Add Stock</button>
          <button onClick={() => setScreen("import")} style={{ padding: "7px 14px", borderRadius: 8, border: "none", background: "#0070f3", color: "#fff", fontSize: 13, cursor: "pointer", fontWeight: 600 }}>↑ Import</button>
        </div>
      </div>

      {/* ── ADD STOCK PANEL ── */}
      {showAdd && (
        <div style={{ background: "#040e1e", borderBottom: "1px solid #0e2340", padding: "20px 28px" }} className="fade">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(8, 1fr)", gap: 12, alignItems: "end" }}>
            {[["name", "Company Name", "text", "e.g. Infosys"], ["ticker", "Ticker", "text", "INFY"], ["qty", "Quantity", "number", "0"], ["avgBuy", "Avg Buy ₹", "number", "0"], ["cmp", "CMP ₹", "number", "0"], ["buyDate", "Buy Date", "date", ""]].map(([k, l, t, pl]) => (
              <div key={k}>
                <label style={labelStyle}>{l}</label>
                <input type={t} placeholder={pl} value={newRow[k]} onChange={e => setNewRow(p => ({ ...p, [k]: e.target.value }))} style={inputStyle} />
              </div>
            ))}
            <div>
              <label style={labelStyle}>Sector</label>
              <select value={newRow.sector} onChange={e => setNewRow(p => ({ ...p, sector: e.target.value }))} style={inputStyle}>
                {SECTORS.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Cap</label>
              <select value={newRow.cap} onChange={e => setNewRow(p => ({ ...p, cap: e.target.value }))} style={inputStyle}>
                {CAPS.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Type</label>
              <select value={newRow.type} onChange={e => setNewRow(p => ({ ...p, type: e.target.value }))} style={inputStyle}>
                {["Stock", "Mutual Fund"].map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={addHolding} style={{ flex: 1, padding: "9px", background: "#0070f3", border: "none", borderRadius: 8, color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>Add</button>
              <button onClick={() => setShowAdd(false)} style={{ padding: "9px 12px", background: "#0e2340", border: "none", borderRadius: 8, color: "#4a7fa5", cursor: "pointer", fontSize: 13 }}>✕</button>
            </div>
          </div>
        </div>
      )}

      <div style={{ padding: "24px 28px" }} className="fade" key={activeTab}>

        {/* ════════════ OVERVIEW TAB ════════════ */}
        {activeTab === "overview" && (
          <div>
            {/* Top stats */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 14, marginBottom: 22 }}>
              <StatChip label="Total Invested" value={"₹" + fmt(stats.totalInvested)} sub={`${holdings.length} instruments`} />
              <StatChip label="Current Value" value={"₹" + fmt(stats.totalCurrent)} color="#00d4ff" sub="Mark to market" />
              <StatChip label="Total P&L" value={(stats.totalPnl >= 0 ? "+" : "") + "₹" + fmt(Math.abs(stats.totalPnl))} color={stats.totalPnl >= 0 ? "#10b981" : "#f43f5e"} sub={pct(stats.totalPnlPct)} />
              <StatChip label="Portfolio Score" value={score.total + "/100"} color={score.total >= 75 ? "#10b981" : score.total >= 50 ? "#f59e0b" : "#f43f5e"} sub="vs industry avg 62" />
              <StatChip label="Est. Tax Liability" value={"₹" + fmt(stats.totalTax)} color="#f59e0b" sub="STCG + LTCG" />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: 18, marginBottom: 18 }}>
              {/* Sector Allocation */}
              <Card>
                <SectionTitle>Sector Allocation</SectionTitle>
                <div style={{ display: "flex", gap: 20, alignItems: "center" }}>
                  <ResponsiveContainer width={160} height={160}>
                    <PieChart>
                      <Pie data={stats.sectorData} dataKey="value" cx="50%" cy="50%" innerRadius={48} outerRadius={75} paddingAngle={2}>
                        {stats.sectorData.map((e, i) => <Cell key={i} fill={SECTOR_COLORS[e.name] || "#475569"} />)}
                      </Pie>
                      <Tooltip formatter={v => ["₹" + fmt(v)]} contentStyle={{ background: "#040e1e", border: "1px solid #0e2340", borderRadius: 8, color: "#f0f9ff", fontSize: 12 }} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div style={{ flex: 1 }}>
                    {stats.sectorData.map((s, i) => (
                      <div key={i} style={{ marginBottom: 8 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                          <span style={{ fontSize: 12, color: "#4a7fa5", display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{ width: 8, height: 8, borderRadius: 2, background: SECTOR_COLORS[s.name] || "#475569", display: "inline-block" }} />
                            {s.name}
                          </span>
                          <span style={{ fontSize: 12, fontWeight: 700, color: "#94a3b8", fontFamily: "'DM Mono',monospace" }}>{s.pct.toFixed(1)}%</span>
                        </div>
                        <div style={{ height: 3, background: "#0e2340", borderRadius: 2 }}>
                          <div style={{ height: 3, width: s.pct + "%", background: SECTOR_COLORS[s.name] || "#475569", borderRadius: 2 }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </Card>

              {/* Benchmark Comparison */}
              <Card>
                <SectionTitle>vs Nifty 50 Benchmark</SectionTitle>
                <div style={{ marginBottom: 16 }}>
                  {[
                    { label: "Your Portfolio", returns: stats.totalPnlPct, color: stats.totalPnlPct >= NIFTY_BENCHMARK.oneYear ? "#10b981" : "#f43f5e" },
                    { label: "Nifty 50 (1Y)", returns: NIFTY_BENCHMARK.oneYear, color: "#4a7fa5" },
                    { label: "Nifty 50 (3Y CAGR)", returns: NIFTY_BENCHMARK.threeYear, color: "#4a7fa5" },
                  ].map((b, i) => (
                    <div key={i} style={{ marginBottom: 14 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                        <span style={{ fontSize: 13, color: "#4a7fa5" }}>{b.label}</span>
                        <span style={{ fontSize: 14, fontWeight: 700, color: b.color, fontFamily: "'DM Mono',monospace" }}>{pct(b.returns)}</span>
                      </div>
                      <div style={{ height: 6, background: "#0e2340", borderRadius: 3 }}>
                        <div style={{ height: 6, width: Math.min(100, Math.abs(b.returns) * 2) + "%", background: b.color, borderRadius: 3 }} />
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{ background: "#040e1e", borderRadius: 8, padding: "12px 14px" }}>
                  <p style={{ margin: 0, fontSize: 12, color: stats.totalPnlPct >= NIFTY_BENCHMARK.oneYear ? "#10b981" : "#f59e0b", lineHeight: 1.5 }}>
                    {stats.totalPnlPct >= NIFTY_BENCHMARK.oneYear ? `✅ You're beating Nifty 50 by ${(stats.totalPnlPct - NIFTY_BENCHMARK.oneYear).toFixed(1)}%` : `⚠️ Underperforming Nifty 50 by ${(NIFTY_BENCHMARK.oneYear - stats.totalPnlPct).toFixed(1)}% — consider reviewing laggards`}
                  </p>
                </div>
              </Card>
            </div>

            {/* Stock vs MF + Cap split */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
              <Card>
                <SectionTitle>Stocks vs Mutual Funds</SectionTitle>
                <div style={{ display: "flex", gap: 16 }}>
                  {[["Stocks", stats.stockRows], ["Mutual Funds", stats.mfRows]].map(([label, arr]) => {
                    const val = arr.reduce((a, r) => a + r.current, 0);
                    const pnlP = arr.reduce((a, r) => a + r.pnl, 0);
                    const pnlPP = val ? (pnlP / arr.reduce((a, r) => a + r.invested, 0)) * 100 : 0;
                    return (
                      <div key={label} style={{ flex: 1, background: "#040e1e", borderRadius: 10, padding: "14px 16px" }}>
                        <p style={{ margin: "0 0 4px", color: "#4a7fa5", fontSize: 12 }}>{label}</p>
                        <p style={{ margin: "0 0 4px", fontSize: 18, fontWeight: 700, color: "#f0f9ff", fontFamily: "'Syne',sans-serif" }}>₹{fmt(val)}</p>
                        <p style={{ margin: 0, fontSize: 12, color: pnlP >= 0 ? "#10b981" : "#f43f5e", fontFamily: "'DM Mono',monospace" }}>{pct(pnlPP)}</p>
                      </div>
                    );
                  })}
                </div>
              </Card>
              <Card>
                <SectionTitle>Market Cap Distribution</SectionTitle>
                {stats.capData.map((c, i) => (
                  <div key={i} style={{ marginBottom: 12 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                      <span style={{ fontSize: 13, color: CAP_COLORS[c.name] }}>{c.name}</span>
                      <span style={{ fontSize: 12, fontFamily: "'DM Mono',monospace", color: "#94a3b8" }}>{c.pct.toFixed(1)}%</span>
                    </div>
                    <div style={{ height: 6, background: "#0e2340", borderRadius: 3 }}>
                      <div style={{ height: 6, width: c.pct + "%", background: CAP_COLORS[c.name], borderRadius: 3 }} />
                    </div>
                  </div>
                ))}
              </Card>
            </div>
          </div>
        )}

        {/* ════════════ SCORE TAB ════════════ */}
        {activeTab === "score" && (
          <div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1.6fr", gap: 20, marginBottom: 20 }}>
              <Card style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                <SectionTitle>Portfolio Health Score</SectionTitle>
                <ScoreGauge score={score.total} />
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, width: "100%", marginTop: 8 }}>
                  {[["Diversification", score.diversification, "#00d4ff"], ["Risk Control", score.risk, "#10b981"], ["Returns", score.returns, "#f59e0b"], ["Cap Balance", score.balance, "#a78bfa"]].map(([l, v, c]) => (
                    <div key={l} style={{ background: "#040e1e", borderRadius: 8, padding: "10px 12px" }}>
                      <p style={{ margin: "0 0 4px", color: "#2a4a6a", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.5px" }}>{l}</p>
                      <p style={{ margin: 0, color: c, fontSize: 20, fontWeight: 700, fontFamily: "'DM Mono',monospace" }}>{v}</p>
                    </div>
                  ))}
                </div>
              </Card>
              <Card>
                <SectionTitle>Score vs Industry Benchmark</SectionTitle>
                <ResponsiveContainer width="100%" height={260}>
                  <RadarChart data={radarData}>
                    <PolarGrid stroke="#0e2340" />
                    <PolarAngleAxis dataKey="subject" tick={{ fill: "#4a7fa5", fontSize: 12, fontFamily: "'DM Sans',sans-serif" }} />
                    <Radar name="Your Portfolio" dataKey="value" stroke="#00d4ff" fill="#00d4ff" fillOpacity={0.15} strokeWidth={2} />
                    <Radar name="Industry Avg" dataKey="benchmark" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.08} strokeWidth={1.5} strokeDasharray="4 2" />
                    <Legend wrapperStyle={{ color: "#4a7fa5", fontSize: 12 }} />
                    <Tooltip contentStyle={{ background: "#040e1e", border: "1px solid #0e2340", borderRadius: 8, color: "#f0f9ff", fontSize: 12 }} />
                  </RadarChart>
                </ResponsiveContainer>
              </Card>
            </div>

            {/* Risk flags + recommendations */}
            <Card>
              <SectionTitle>Concentration Risk Flags</SectionTitle>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 20 }}>
                {[
                  { label: "Top Stock Weight", value: Math.max(...rows.map(r => (r.current / stats.totalCurrent) * 100)).toFixed(1) + "%", threshold: 25, tip: "Keep any single stock below 25%" },
                  { label: "Top 3 Holdings", value: [...rows].sort((a, b) => b.current - a.current).slice(0, 3).reduce((a, r) => a + (r.current / stats.totalCurrent) * 100, 0).toFixed(1) + "%", threshold: 50, tip: "Top 3 should be below 50%" },
                  { label: "Top Sector", value: (stats.sectorData[0]?.pct || 0).toFixed(1) + "%", threshold: 35, tip: "No sector should exceed 35%" },
                ].map((item, i) => {
                  const val = parseFloat(item.value);
                  const bad = val > item.threshold;
                  return (
                    <div key={i} style={{ background: "#040e1e", border: `1px solid ${bad ? "#7f1d1d" : "#14532d"}`, borderRadius: 10, padding: "16px 18px" }}>
                      <p style={{ margin: "0 0 6px", color: "#2a4a6a", fontSize: 11, textTransform: "uppercase" }}>{item.label}</p>
                      <p style={{ margin: "0 0 6px", fontSize: 26, fontWeight: 800, color: bad ? "#f43f5e" : "#10b981", fontFamily: "'Syne',sans-serif" }}>{item.value}</p>
                      <p style={{ margin: 0, fontSize: 11, color: bad ? "#fca5a5" : "#86efac" }}>{bad ? "⚠️ " : "✅ "}{item.tip}</p>
                    </div>
                  );
                })}
              </div>
              <SectionTitle>Stocks to Consider Trimming</SectionTitle>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                {rows.filter(r => (r.current / stats.totalCurrent) * 100 > 20 || r.pnlPct < -10).map((r, i) => (
                  <div key={i} style={{ background: "#0e1a2e", border: "1px solid #1e3a5f", borderRadius: 8, padding: "10px 14px" }}>
                    <p style={{ margin: "0 0 4px", fontWeight: 600, color: "#f0f9ff", fontSize: 13 }}>{r.ticker}</p>
                    <p style={{ margin: 0, color: "#4a7fa5", fontSize: 11 }}>{((r.current / stats.totalCurrent) * 100).toFixed(1)}% of portfolio · {pct(r.pnlPct)}</p>
                  </div>
                ))}
                {rows.filter(r => (r.current / stats.totalCurrent) * 100 > 20 || r.pnlPct < -10).length === 0 && <p style={{ color: "#10b981", fontSize: 13 }}>✅ No immediate trimming needed — portfolio is well balanced.</p>}
              </div>
            </Card>
          </div>
        )}

        {/* ════════════ HOLDINGS TAB ════════════ */}
        {activeTab === "holdings" && (
          <Card style={{ padding: 0 }}>
            <div style={{ padding: "18px 24px", borderBottom: "1px solid #0e2340", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <SectionTitle>All Holdings</SectionTitle>
              <span style={{ color: "#2a4a6a", fontSize: 12, fontFamily: "'DM Mono',monospace" }}>{holdings.length} instruments · ₹{fmt(stats.totalCurrent)}</span>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "#040e1e" }}>
                    {["Stock", "Type", "Sector", "Qty", "Avg Buy", "CMP", "Invested", "Current Value", "P&L", "Return", "Cap", "Holding", ""].map(h => (
                      <th key={h} style={{ padding: "11px 14px", textAlign: "left", color: "#2a4a6a", fontSize: 10, fontWeight: 700, letterSpacing: "1px", textTransform: "uppercase", borderBottom: "1px solid #0e2340", whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid #0e2340" }}>
                      <td style={{ padding: "12px 14px" }}>
                        <p style={{ margin: 0, fontWeight: 600, color: "#f0f9ff", fontSize: 13 }}>{r.name}</p>
                        <p style={{ margin: 0, color: "#2a4a6a", fontSize: 11, fontFamily: "'DM Mono',monospace" }}>{r.ticker}</p>
                      </td>
                      <td style={{ padding: "12px 14px" }}><Tag color={r.type === "Stock" ? "#00d4ff" : "#a78bfa"}>{r.type}</Tag></td>
                      <td style={{ padding: "12px 14px" }}><Tag color={SECTOR_COLORS[r.sector] || "#475569"}>{r.sector}</Tag></td>
                      <td style={{ padding: "12px 14px", color: "#4a7fa5", fontFamily: "'DM Mono',monospace", fontSize: 13 }}>{r.qty}</td>
                      <td style={{ padding: "12px 14px", color: "#4a7fa5", fontFamily: "'DM Mono',monospace", fontSize: 13 }}>₹{fmt(r.avgBuy)}</td>
                      <td style={{ padding: "12px 14px", color: "#00d4ff", fontFamily: "'DM Mono',monospace", fontSize: 13, fontWeight: 600 }}>₹{fmt(r.cmp)}</td>
                      <td style={{ padding: "12px 14px", color: "#4a7fa5", fontFamily: "'DM Mono',monospace", fontSize: 13 }}>₹{fmt(r.invested)}</td>
                      <td style={{ padding: "12px 14px", color: "#f0f9ff", fontFamily: "'DM Mono',monospace", fontSize: 13, fontWeight: 600 }}>₹{fmt(r.current)}</td>
                      <td style={{ padding: "12px 14px", color: r.pnl >= 0 ? "#10b981" : "#f43f5e", fontFamily: "'DM Mono',monospace", fontSize: 13, fontWeight: 600 }}>
                        {r.pnl >= 0 ? "+" : ""}₹{fmt(Math.abs(r.pnl))}
                      </td>
                      <td style={{ padding: "12px 14px" }}>
                        <span style={{ background: r.pnlPct >= 0 ? "#052e16" : "#450a0a", color: r.pnlPct >= 0 ? "#10b981" : "#f43f5e", padding: "3px 8px", borderRadius: 4, fontSize: 12, fontWeight: 700, fontFamily: "'DM Mono',monospace" }}>{pct(r.pnlPct)}</span>
                      </td>
                      <td style={{ padding: "12px 14px" }}><Tag color={CAP_COLORS[r.cap]}>{r.cap}</Tag></td>
                      <td style={{ padding: "12px 14px" }}>
                        <span style={{ background: r.isLTCG ? "#1a3a1a" : "#2a1a0a", color: r.isLTCG ? "#10b981" : "#f59e0b", padding: "3px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600 }}>{r.isLTCG ? "LTCG" : "STCG"}</span>
                      </td>
                      <td style={{ padding: "12px 14px" }}>
                        <button onClick={() => setHoldings(p => p.filter((_, j) => j !== i))} style={{ background: "#200a0a", color: "#f43f5e", border: "1px solid #7f1d1d", borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontSize: 11 }}>✕</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {/* ════════════ TAX TAB ════════════ */}
        {activeTab === "tax" && (
          <div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14, marginBottom: 20 }}>
              <StatChip label="Total Tax Liability" value={"₹" + fmt(stats.totalTax)} color="#f59e0b" sub="FY 2024-25 estimate" />
              <StatChip label="STCG Tax @15%" value={"₹" + fmt(stats.stcgTax)} color="#f43f5e" sub="Holding < 12 months" />
              <StatChip label="LTCG Tax @10%" value={"₹" + fmt(stats.ltcgTax)} color="#10b981" sub="Above ₹1L exemption" />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18, marginBottom: 18 }}>
              <Card>
                <SectionTitle>STCG vs LTCG Breakdown</SectionTitle>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={rows.map(r => ({ name: r.ticker, tax: +r.tax.toFixed(0), fill: r.isLTCG ? "#10b981" : "#f43f5e" }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#0e2340" />
                    <XAxis dataKey="name" tick={{ fill: "#2a4a6a", fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: "#2a4a6a", fontSize: 10 }} axisLine={false} tickLine={false} />
                    <Tooltip formatter={v => ["₹" + fmt(v), "Tax"]} contentStyle={{ background: "#040e1e", border: "1px solid #0e2340", borderRadius: 8, color: "#f0f9ff", fontSize: 12 }} />
                    <Bar dataKey="tax" radius={[4, 4, 0, 0]}>
                      {rows.map((r, i) => <Cell key={i} fill={r.isLTCG ? "#10b981" : "#f43f5e"} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </Card>
              <Card>
                <SectionTitle>Tax Saving Opportunities</SectionTitle>
                <div style={{ marginBottom: 12 }}>
                  <p style={{ color: "#4a7fa5", fontSize: 13, lineHeight: 1.7 }}>
                    💡 <strong style={{ color: "#f0f9ff" }}>Tax Loss Harvesting:</strong> Book losses in underperforming stocks to offset gains and reduce your tax outgo.
                  </p>
                </div>
                {rows.filter(r => r.pnl < 0).length > 0 ? (
                  <div>
                    <p style={{ color: "#2a4a6a", fontSize: 12, marginBottom: 8 }}>Stocks with unrealised losses you can harvest:</p>
                    {rows.filter(r => r.pnl < 0).map((r, i) => (
                      <div key={i} style={{ background: "#040e1e", borderRadius: 8, padding: "10px 12px", marginBottom: 8, display: "flex", justifyContent: "space-between" }}>
                        <span style={{ color: "#f0f9ff", fontSize: 13 }}>{r.ticker}</span>
                        <span style={{ color: "#f43f5e", fontFamily: "'DM Mono',monospace", fontSize: 13 }}>-₹{fmt(Math.abs(r.pnl))}</span>
                      </div>
                    ))}
                  </div>
                ) : <p style={{ color: "#10b981", fontSize: 13 }}>✅ No loss positions — nothing to harvest right now.</p>}
                <div style={{ marginTop: 14, background: "#040e1e", borderRadius: 8, padding: "12px 14px" }}>
                  <p style={{ margin: 0, color: "#f59e0b", fontSize: 12, lineHeight: 1.6 }}>💡 LTCG up to ₹1,00,000 per year is tax-free. Plan redemptions around this limit to maximize savings.</p>
                </div>
              </Card>
            </div>

            <Card>
              <SectionTitle>Detailed Tax Statement</SectionTitle>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    {["Stock", "Buy Date", "Holding Days", "Type", "Gain/Loss", "Tax Rate", "Tax Due"].map(h => (
                      <th key={h} style={{ padding: "10px 14px", textAlign: "left", color: "#2a4a6a", fontSize: 10, textTransform: "uppercase", letterSpacing: "1px", borderBottom: "1px solid #0e2340" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid #0e2340" }}>
                      <td style={{ padding: "11px 14px", color: "#f0f9ff", fontSize: 13 }}>{r.ticker}</td>
                      <td style={{ padding: "11px 14px", color: "#4a7fa5", fontFamily: "'DM Mono',monospace", fontSize: 12 }}>{r.buyDate || "—"}</td>
                      <td style={{ padding: "11px 14px", color: "#4a7fa5", fontFamily: "'DM Mono',monospace", fontSize: 12 }}>{r.days}d</td>
                      <td style={{ padding: "11px 14px" }}><span style={{ background: r.isLTCG ? "#1a3a1a" : "#2a1a0a", color: r.isLTCG ? "#10b981" : "#f59e0b", padding: "3px 8px", borderRadius: 4, fontSize: 11 }}>{r.isLTCG ? "LTCG" : "STCG"}</span></td>
                      <td style={{ padding: "11px 14px", color: r.pnl >= 0 ? "#10b981" : "#f43f5e", fontFamily: "'DM Mono',monospace", fontSize: 13 }}>{r.pnl >= 0 ? "+" : ""}₹{fmt(Math.abs(r.pnl))}</td>
                      <td style={{ padding: "11px 14px", color: "#4a7fa5", fontSize: 12 }}>{r.isLTCG ? "10% (above ₹1L)" : "15%"}</td>
                      <td style={{ padding: "11px 14px", color: "#f59e0b", fontFamily: "'DM Mono',monospace", fontSize: 13, fontWeight: 600 }}>₹{fmt(r.tax)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </div>
        )}

        {/* ════════════ GOALS TAB ════════════ */}
        {activeTab === "goals" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1.5fr", gap: 20 }}>
            <div>
              <Card>
                <SectionTitle>Define Your Goal</SectionTitle>
                <div style={{ marginBottom: 14 }}>
                  <label style={labelStyle}>Goal Name</label>
                  <select value={goalForm.name} onChange={e => setGoalForm(p => ({ ...p, name: e.target.value }))} style={{ ...inputStyle }}>
                    {["Retirement", "Child's Education", "House Purchase", "Car", "Emergency Fund", "Vacation", "Business"].map(g => <option key={g}>{g}</option>)}
                  </select>
                </div>
                {[["target", "Target Amount (₹)", "number"], ["years", "Time Horizon (Years)", "number"], ["monthly", "Monthly SIP (₹)", "number"]].map(([k, l, t]) => (
                  <div key={k} style={{ marginBottom: 14 }}>
                    <label style={labelStyle}>{l}</label>
                    <input type={t} value={goalForm[k]} onChange={e => setGoalForm(p => ({ ...p, [k]: +e.target.value }))} style={inputStyle} />
                  </div>
                ))}
                <div style={{ background: "#040e1e", borderRadius: 10, padding: "14px 16px", marginTop: 8 }}>
                  <p style={{ margin: "0 0 6px", color: "#2a4a6a", fontSize: 11, textTransform: "uppercase" }}>Projected Corpus</p>
                  <p style={{ margin: "0 0 4px", fontSize: 24, fontWeight: 800, color: goalProjection.onTrack ? "#10b981" : "#f43f5e", fontFamily: "'Syne',sans-serif" }}>₹{fmt(goalProjection.projected)}</p>
                  <p style={{ margin: 0, color: goalProjection.onTrack ? "#10b981" : "#f59e0b", fontSize: 12 }}>
                    {goalProjection.onTrack ? `✅ On track! Surplus: ₹${fmt(Math.abs(goalProjection.gap))}` : `⚠️ Gap: ₹${fmt(Math.abs(goalProjection.gap))} — increase SIP or extend timeline`}
                  </p>
                </div>
              </Card>
            </div>
            <Card>
              <SectionTitle>Projected Growth vs Target</SectionTitle>
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={goalProjection.chartData}>
                  <defs>
                    <linearGradient id="projGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#00d4ff" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#00d4ff" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="targGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.2} />
                      <stop offset="100%" stopColor="#f59e0b" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#0e2340" />
                  <XAxis dataKey="year" tick={{ fill: "#2a4a6a", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "#2a4a6a", fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => "₹" + (v / 1e6).toFixed(1) + "L"} />
                  <Tooltip formatter={v => ["₹" + fmt(v)]} contentStyle={{ background: "#040e1e", border: "1px solid #0e2340", borderRadius: 8, color: "#f0f9ff", fontSize: 12 }} />
                  <Legend wrapperStyle={{ color: "#4a7fa5", fontSize: 12 }} />
                  <Area type="monotone" dataKey="projected" name="Your Projection" stroke="#00d4ff" fill="url(#projGrad)" strokeWidth={2} />
                  <Area type="monotone" dataKey="target" name="Your Goal" stroke="#f59e0b" fill="url(#targGrad)" strokeWidth={2} strokeDasharray="5 3" />
                </AreaChart>
              </ResponsiveContainer>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginTop: 16 }}>
                {[["Current Portfolio", "₹" + fmt(stats.totalCurrent), "#00d4ff"], ["Target Amount", "₹" + fmt(goalForm.target), "#f59e0b"], ["Assumed CAGR", "12%", "#10b981"]].map(([l, v, c]) => (
                  <div key={l} style={{ background: "#040e1e", borderRadius: 8, padding: "10px 12px", textAlign: "center" }}>
                    <p style={{ margin: "0 0 4px", color: "#2a4a6a", fontSize: 10, textTransform: "uppercase" }}>{l}</p>
                    <p style={{ margin: 0, color: c, fontWeight: 700, fontFamily: "'DM Mono',monospace", fontSize: 14 }}>{v}</p>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        )}

        {/* ════════════ AI TAB ════════════ */}
        {activeTab === "ai" && <AIPanel rows={rows} stats={stats} score={score} />}
      </div>

      <div style={{ textAlign: "center", color: "#0e2340", fontSize: 11, padding: "20px 0 32px", fontFamily: "'DM Mono',monospace" }}>
        Stocks Scanner · For informational purposes only · Not SEBI registered investment advice
      </div>
    </div>
  );
}
