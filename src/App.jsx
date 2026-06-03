import { useState, useEffect, useRef } from "react";
import {
  AreaChart, Area, BarChart, Bar, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine
} from "recharts";
import { Activity, Zap, TrendingUp, Download, AlertTriangle, CheckCircle, RefreshCw } from "lucide-react";

const HISTORY = 120;
const POLL_MS = 1000;

function parseCSV(text) {
  const lines = text.trim().split("\n").filter(Boolean);
  if (lines.length < 2) return [];
  return lines.slice(1).map((line, i) => {
    const parts = line.split(",");
    const voltage = parseFloat(parts[1]);
    return isNaN(voltage) ? null : {
      t: i,
      ts: parts[0]?.trim() || "",
      voltage: Math.max(0, voltage)
    };
  }).filter(Boolean);
}

function linReg(arr) {
  const n = arr.length;
  if (n < 2) return { slope: 0, intercept: arr[0] || 0 };
  const xs = arr.map((_, i) => i);
  const xMean = xs.reduce((s, x) => s + x, 0) / n;
  const yMean = arr.reduce((s, y) => s + y, 0) / n;
  const denom = xs.reduce((s, x) => s + (x - xMean) ** 2, 0);
  if (!denom) return { slope: 0, intercept: yMean };
  const slope = xs.reduce((s, x, i) => s + (x - xMean) * (arr[i] - yMean), 0) / denom;
  return { slope, intercept: yMean - slope * xMean };
}

const CustomTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "#fff", border: "1px solid #bfdbfe", borderRadius: 8, padding: "8px 12px", fontSize: 12, boxShadow: "0 4px 12px rgba(37,99,235,0.1)" }}>
      {payload.map(p => (
        <p key={p.dataKey} style={{ color: p.color, margin: "2px 0" }}>
          {p.name}: <strong style={{ color: "#1e3a5f" }}>{typeof p.value === "number" ? p.value.toFixed(3) : p.value}{p.dataKey === "power" ? " V²" : " V"}</strong>
        </p>
      ))}
    </div>
  );
};

export default function App() {
  const [data, setData] = useState([]);
  const [totalRows, setTotalRows] = useState(0);
  const [status, setStatus] = useState("waiting");
  const [lastUpdated, setLastUpdated] = useState(null);
  const pollRef = useRef(null);

  const fetchData = async () => {
    try {
      const res = await fetch(`/data.csv?t=${Date.now()}`);
      if (!res.ok) { setStatus("error"); return; }
      const text = await res.text();
      const rows = parseCSV(text);
      if (rows.length === 0) { setStatus("waiting"); return; }
      setTotalRows(rows.length);
      setData(rows.slice(-HISTORY));
      setStatus("live");
      setLastUpdated(new Date().toLocaleTimeString());
    } catch {
      setStatus("error");
    }
  };

  useEffect(() => {
    fetchData();
    pollRef.current = setInterval(fetchData, POLL_MS);
    return () => clearInterval(pollRef.current);
  }, []);

  const voltages = data.map(d => d.voltage);
  const chartData = data.map((d, i) => ({
    i, t: d.t, ts: d.ts,
    voltage: d.voltage,
    power: +(d.voltage ** 2).toFixed(4),
    label: `${d.t}`
  }));

  const peak        = voltages.length ? Math.max(...voltages) : 0;
  const avg         = voltages.length ? voltages.reduce((s, v) => s + v, 0) / voltages.length : 0;
  const std         = voltages.length ? Math.sqrt(voltages.reduce((s, v) => s + (v - avg) ** 2, 0) / voltages.length) : 0;
  const stability   = avg > 0 ? Math.max(0, 100 * (1 - std / avg)) : 0;
  const maxV        = voltages.length ? Math.max(...voltages) : 10;
  const normOutput  = (avg / maxV) * 100;
  const energy      = voltages.reduce((s, v) => s + v ** 2 / 3600 * 1000, 0);
  const { slope, intercept } = voltages.length > 2 ? linReg(voltages) : { slope: 0, intercept: 0 };
  const forecastV   = Math.max(0, slope * (voltages.length + 10) + intercept);
  const statusOk    = avg >= 0.5;
  const statusLabel = avg < 0.1 ? "Minimal Activity" : avg < 1.0 ? "Moderate Activity" : "High Output";

  const recentBars = chartData.slice(-30).map((d) => ({
    i: d.i, v: d.voltage,
    fill: d.voltage > (maxV * 0.7) ? "#f59e0b" : d.voltage > (maxV * 0.3) ? "#2563eb" : "#bfdbfe"
  }));

  const downloadCSV = () => {
    const csv = ["timestamp,voltage,power",
      ...chartData.map(r => `${r.ts || r.t},${r.voltage},${r.power}`)
    ].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = "piezo_export.csv"; a.click();
  };

  const metrics = [
    { label: "PEAK VOLTAGE",  val: `${peak.toFixed(3)} V`,       accent: "#f59e0b", bg: "#fffbeb", icon: <TrendingUp size={13}/> },
    { label: "AVG VOLTAGE",   val: `${avg.toFixed(3)} V`,        accent: "#2563eb", bg: "#eff6ff", icon: <Activity size={13}/> },
    { label: "STABILITY",     val: `${stability.toFixed(1)} %`,  accent: "#059669", bg: "#ecfdf5", icon: <CheckCircle size={13}/> },
    { label: "NORM. OUTPUT",  val: `${normOutput.toFixed(1)} %`, accent: "#7c3aed", bg: "#f5f3ff", icon: <Zap size={13}/> },
    { label: "EST. ENERGY",   val: `${energy.toFixed(2)} mWh`,   accent: "#ea580c", bg: "#fff7ed", icon: <Zap size={13}/> },
    { label: "FORECAST +10s", val: `${forecastV.toFixed(3)} V`,  accent: "#0891b2", bg: "#ecfeff", icon: <TrendingUp size={13}/> },
  ];

  return (
    <div style={{ minHeight: "100vh", background: "#f0f6ff", fontFamily: "'JetBrains Mono','Fira Code',monospace", color: "#1e3a5f", padding: 0 }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;600;700&family=Space+Grotesk:wght@400;600;700&display=swap');
        * { box-sizing:border-box; margin:0; padding:0; }
        ::-webkit-scrollbar { width:6px; } ::-webkit-scrollbar-track { background:#e0eeff; } ::-webkit-scrollbar-thumb { background:#93c5fd; border-radius:3px; }
        .card { background:#fff; border:1px solid #bfdbfe; border-radius:12px; box-shadow:0 1px 4px rgba(37,99,235,0.07); }
        .pulse { animation:pulse 1.5s ease-in-out infinite; }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
        .btn { cursor:pointer; border:1px solid #93c5fd; border-radius:7px; background:#eff6ff; color:#1d4ed8; font-family:inherit; font-size:12px; padding:6px 14px; display:flex; align-items:center; gap:6px; transition:all .15s; font-weight:500; }
        .btn:hover { background:#dbeafe; border-color:#3b82f6; }
        .metric-card { border-radius:12px; padding:14px 16px; border:1px solid; position:relative; overflow:hidden; }
        .metric-card::before { content:''; position:absolute; top:0; left:0; right:0; height:3px; background:var(--ac); border-radius:12px 12px 0 0; }
      `}</style>

      {/* HEADER */}
      <div style={{ borderBottom:"1px solid #bfdbfe", padding:"14px 28px", display:"flex", alignItems:"center", justifyContent:"space-between", background:"#fff", boxShadow:"0 1px 6px rgba(37,99,235,0.08)" }}>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          <div style={{ width:36, height:36, background:"linear-gradient(135deg,#2563eb,#0ea5e9)", borderRadius:9, display:"flex", alignItems:"center", justifyContent:"center", boxShadow:"0 2px 8px rgba(37,99,235,0.3)" }}>
            <Zap size={19} color="#fff" />
          </div>
          <div>
            <div style={{ fontFamily:"'Space Grotesk',sans-serif", fontWeight:700, fontSize:16, color:"#1e3a5f" }}>PIEZO ANALYTICS</div>
            <div style={{ fontSize:10, color:"#64748b", letterSpacing:"0.14em" }}>ENERGY MONITORING SYSTEM</div>
          </div>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          {status === "live" && (
            <div style={{ display:"flex", alignItems:"center", gap:6, fontSize:11, color:"#2563eb", fontWeight:600 }}>
              <div className="pulse" style={{ width:7, height:7, borderRadius:"50%", background:"#2563eb" }} />
              LIVE · {totalRows} rows · updated {lastUpdated}
            </div>
          )}
          {status === "waiting" && (
            <div style={{ display:"flex", alignItems:"center", gap:6, fontSize:11, color:"#f59e0b", fontWeight:600 }}>
              <div className="pulse" style={{ width:7, height:7, borderRadius:"50%", background:"#f59e0b" }} />
              Waiting for data.csv…
            </div>
          )}
          {status === "error" && (
            <div style={{ display:"flex", alignItems:"center", gap:6, fontSize:11, color:"#dc2626", fontWeight:600 }}>
              <AlertTriangle size={13}/> data.csv not found — place it in the piezo-dashboard folder
            </div>
          )}
          <button className="btn" onClick={fetchData}><RefreshCw size={13}/> Refresh</button>
          <button className="btn" onClick={downloadCSV}><Download size={13}/> Export</button>
        </div>
      </div>

      {/* NO DATA */}
      {data.length === 0 && (
        <div style={{ margin:"40px auto", maxWidth:480, background:"#fff", border:"1px solid #bfdbfe", borderRadius:14, padding:"32px", textAlign:"center", boxShadow:"0 2px 12px rgba(37,99,235,0.08)" }}>
          <div style={{ fontSize:36, marginBottom:12 }}>📂</div>
          <div style={{ fontFamily:"'Space Grotesk',sans-serif", fontWeight:700, fontSize:18, color:"#1e3a5f", marginBottom:8 }}>Waiting for data.csv</div>
          <div style={{ fontSize:12, color:"#64748b", lineHeight:1.7 }}>
            Place your <span style={{ color:"#2563eb", fontWeight:600 }}>data.csv</span> file inside the<br/>
            <code style={{ background:"#eff6ff", padding:"2px 8px", borderRadius:4, color:"#1d4ed8" }}>piezo-dashboard/</code> folder,<br/>
            then run your Arduino recording script.<br/><br/>
            The dashboard auto-updates every second.
          </div>
        </div>
      )}

      {data.length > 0 && (
        <div style={{ padding:"20px 28px", display:"flex", flexDirection:"column", gap:16 }}>

          {/* METRICS */}
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(155px,1fr))", gap:10 }}>
            {metrics.map(({ label, val, accent, bg, icon }) => (
              <div key={label} className="metric-card" style={{ background:bg, borderColor:accent+"44", "--ac":accent }}>
                <div style={{ display:"flex", alignItems:"center", gap:5, color:accent, fontSize:10, marginBottom:8, letterSpacing:"0.08em", fontWeight:600 }}>
                  {icon} {label}
                </div>
                <div style={{ fontFamily:"'JetBrains Mono',monospace", fontWeight:700, fontSize:20, color:"#1e3a5f" }}>{val}</div>
              </div>
            ))}
          </div>

          {/* STATUS BAR */}
          <div className="card" style={{ padding:"10px 16px", display:"flex", alignItems:"center", gap:12 }}>
            <div style={{ display:"flex", alignItems:"center", gap:6, fontSize:12, fontWeight:600, color:statusOk?"#059669":"#dc2626" }}>
              {statusOk ? <CheckCircle size={13}/> : <AlertTriangle size={13}/>} {statusLabel}
            </div>
            <div style={{ flex:1, height:5, background:"#dbeafe", borderRadius:3, overflow:"hidden" }}>
              <div style={{ height:"100%", width:`${normOutput}%`, borderRadius:3, background:normOutput>60?"#f59e0b":"#2563eb", transition:"width 0.4s ease" }} />
            </div>
            <div style={{ fontSize:11, color:"#64748b", minWidth:90, textAlign:"right" }}>σ = {std.toFixed(4)} V</div>
          </div>

          {/* MAIN CHART */}
          <div className="card" style={{ padding:"18px" }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14 }}>
              <div style={{ fontSize:12, color:"#1e3a5f", fontWeight:600, letterSpacing:"0.06em" }}>VOLTAGE · RELATIVE POWER</div>
              <div style={{ display:"flex", gap:16, fontSize:11 }}>
                {[["#2563eb","Voltage"],["#7c3aed","Power (V²)"]].map(([c,l]) => (
                  <span key={l} style={{ display:"flex", alignItems:"center", gap:5, color:"#64748b" }}>
                    <span style={{ width:10, height:10, borderRadius:2, background:c }}/>{l}
                  </span>
                ))}
              </div>
            </div>
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={chartData} margin={{ top:4, right:8, bottom:0, left:-14 }}>
                <defs>
                  <linearGradient id="gV" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#2563eb" stopOpacity={0.18}/>
                    <stop offset="95%" stopColor="#2563eb" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="gP" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#7c3aed" stopOpacity={0.12}/>
                    <stop offset="95%" stopColor="#7c3aed" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#dbeafe" strokeDasharray="3 5"/>
                <XAxis dataKey="label" tick={{ fill:"#94a3b8", fontSize:10 }} tickLine={false} axisLine={false} interval={Math.floor(chartData.length/8)}/>
                <YAxis yAxisId="left"  tick={{ fill:"#94a3b8", fontSize:10 }} tickLine={false} axisLine={false} domain={[0,"auto"]}/>
                <YAxis yAxisId="right" orientation="right" tick={{ fill:"#c4b5fd", fontSize:10 }} tickLine={false} axisLine={false} domain={[0,"auto"]}/>
                <Tooltip content={<CustomTooltip/>}/>
                <ReferenceLine yAxisId="left" y={avg} stroke="#93c5fd" strokeDasharray="4 4"/>
                <Area yAxisId="right" dataKey="power"   name="Power"   stroke="#7c3aed" strokeWidth={1}   fill="url(#gP)" dot={false}/>
                <Area yAxisId="left"  dataKey="voltage" name="Voltage" stroke="#2563eb" strokeWidth={2}   fill="url(#gV)" dot={false}/>
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* BOTTOM ROW */}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
            <div className="card" style={{ padding:"16px" }}>
              <div style={{ fontSize:11, color:"#1e3a5f", fontWeight:600, letterSpacing:"0.08em", marginBottom:12 }}>LAST 30 SAMPLES</div>
              <ResponsiveContainer width="100%" height={170}>
                <BarChart data={recentBars} margin={{ top:2, right:4, bottom:0, left:-20 }} barCategoryGap="18%">
                  <CartesianGrid stroke="#dbeafe" strokeDasharray="2 4" vertical={false}/>
                  <XAxis dataKey="i" hide/>
                  <YAxis tick={{ fill:"#94a3b8", fontSize:9 }} tickLine={false} axisLine={false} domain={[0,"auto"]}/>
                  <Tooltip content={({ active, payload }) => active && payload?.length ? (
                    <div style={{ background:"#fff", border:"1px solid #bfdbfe", borderRadius:6, padding:"5px 10px", fontSize:11, color:"#1e3a5f", fontWeight:600, boxShadow:"0 2px 8px rgba(37,99,235,0.1)" }}>
                      {(+payload[0].value).toFixed(3)} V
                    </div>
                  ) : null}/>
                  <Bar dataKey="v" name="Voltage" radius={[3,3,0,0]} maxBarSize={18}>
                    {recentBars.map((b) => <Cell key={b.i} fill={b.fill}/>)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="card" style={{ padding:"16px" }}>
              <div style={{ fontSize:11, color:"#1e3a5f", fontWeight:600, letterSpacing:"0.08em", marginBottom:12 }}>SIGNAL STATISTICS</div>
              <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
                <tbody>
                  {[
                    ["Samples",     `${data.length} shown / ${totalRows} total`],
                    ["Min",         `${voltages.length ? Math.min(...voltages).toFixed(4) : "—"} V`],
                    ["Max",         `${peak.toFixed(4)} V`],
                    ["Mean",        `${avg.toFixed(4)} V`],
                    ["Std Dev (σ)", `${std.toFixed(4)} V`],
                    ["CV",          `${avg > 0 ? (std/avg*100).toFixed(1) : "—"} %`],
                    ["Slope",       `${slope.toFixed(5)} V/s`],
                    ["Norm output", `${normOutput.toFixed(2)} %`],
                    ["Energy est.", `${energy.toFixed(4)} mWh`],
                  ].map(([k, v]) => (
                    <tr key={k} style={{ borderBottom:"1px solid #dbeafe" }}>
                      <td style={{ padding:"7px 0", color:"#64748b" }}>{k}</td>
                      <td style={{ padding:"7px 0", textAlign:"right", color:"#1e3a5f", fontWeight:600 }}>{v}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div style={{ textAlign:"center", padding:"8px 0 2px", borderTop:"1px solid #bfdbfe" }}>
            <span style={{ fontSize:11, color:"#94a3b8" }}>
              Piezoelectric Energy Analytics · Developed by{" "}
              <span style={{ color:"#2563eb", fontWeight:600 }}>Inika Ranganath Prasad</span>
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
